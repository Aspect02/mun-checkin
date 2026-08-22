/*************************************************************
 * MODEL UN CLUB MANAGEMENT SYSTEM — FAST / STRICT BACKEND
 *************************************************************/

const STUDENT_ID_LENGTH = 7;
const MEMBER_CACHE_SECONDS = 120;
const EVENT_CACHE_SECONDS = 20;

function doGet(e) {
  e = e || { parameter: {} };
  const page = String(e.parameter.page || "").trim().toLowerCase();
  const action = String(e.parameter.action || "").trim().toLowerCase();

  if (page === "officer") {
    return HtmlService.createHtmlOutputFromFile("OfficerDashboard")
      .setTitle("Model UN Officer Dashboard");
  }

  if (action === "checkin") {
    return outputApiResult(checkInData(e.parameter.id), e.parameter.callback);
  }

  if (action === "register") {
    return outputApiResult(
      registerNewMember(
        e.parameter.id,
        e.parameter.name,
        e.parameter.email,
        e.parameter.grade
      ),
      e.parameter.callback
    );
  }

  if (action === "status") {
    return outputApiResult(getScannerStatus(), e.parameter.callback);
  }

  if (action === "memberstatus") {
    return outputApiResult(getMemberStatus(e.parameter.id), e.parameter.callback);
  }

  if (page === "" || page === "scanner") {
    return HtmlService.createHtmlOutputFromFile("Scanner")
      .setTitle("Model UN Check-In");
  }

  return HtmlService.createHtmlOutput("Model UN Club Management System");
}

function setupOptimizations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const members = ss.getSheetByName("MEMBERS");
  const attendance = ss.getSheetByName("ATTENDANCE");
  const points = ss.getSheetByName("POINTS");

  if (members) members.getRange("A:A").setNumberFormat("@");
  if (attendance) attendance.getRange("B:B").setNumberFormat("@");
  if (points) points.getRange("B:B").setNumberFormat("@");

  SpreadsheetApp.flush();
  clearSystemCaches();
}

function canonicalStudentId(value) {
  let id = String(value == null ? "" : value).trim();

  if (id.startsWith("*") && id.endsWith("*") && id.length > 2) {
    id = id.slice(1, -1);
  }

  // API compatibility: camera scans can arrive without the
  // leading zero, so restore it before validation/storage.
  if (/^\d{6}$/.test(id)) {
    id = "0" + id;
  }

  if (!/^\d{7}$/.test(id)) {
    return "";
  }

  return id;
}

/**
 * READ-ONLY compatibility helper for values already in Sheets.
 *
 * It never relaxes scanner input validation. It only lets the system
 * understand an old numeric cell such as 620829 as the historical
 * representation of 0620829.
 */
function canonicalSheetStudentId(value) {
  let id = String(value == null ? "" : value).trim();

  if (!/^\d+$/.test(id) || id.length > STUDENT_ID_LENGTH) {
    return "";
  }

  return id.padStart(STUDENT_ID_LENGTH, "0");
}

function normalizeStudentId(value) {
  const canonical = canonicalStudentId(value);
  if (!canonical) return "";
  return canonical.replace(/^0+(?=\d)/, "");
}

function studentIdForStorage(value) {
  const id = canonicalStudentId(value);
  if (!id) throw new Error("Invalid Student ID.");
  return id;
}

function normalizeEventId(value) {
  return String(value == null ? "" : value).trim().toUpperCase();
}

function clearSystemCaches() {
  const cache = CacheService.getScriptCache();
  cache.remove("member_index");
  cache.remove("active_event");
}

function invalidateMemberCache() {
  CacheService.getScriptCache().remove("member_index");
}


function getMemberIndex(membersSheet) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("member_index");

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      cache.remove("member_index");
    }
  }

  const lastRow = membersSheet.getLastRow();
  const index = {};

  if (lastRow >= 2) {
    const values = membersSheet
      .getRange(2, 1, lastRow - 1, 5)
      .getDisplayValues();

    for (let i = 0; i < values.length; i++) {
      const id = canonicalSheetStudentId(values[i][0]);
      if (!id) continue;

      index[id] = {
        id: id,
        name: String(values[i][1] || "").trim(),
        email: String(values[i][2] || "").trim(),
        grade: values[i][3],
        status: String(values[i][4] || "").trim(),
        row: i + 2
      };
    }
  }

  try {
    cache.put("member_index", JSON.stringify(index), MEMBER_CACHE_SECONDS);
  } catch (error) {}

  return index;
}

function findStudentById(membersSheet, studentId) {
  const id = canonicalStudentId(studentId);
  if (!id) return null;
  return getMemberIndex(membersSheet)[id] || null;
}

/**
 * Re-check one cached member row directly from the sheet.
 * This prevents stale cache authorization without rebuilding the
 * entire member index on every successful scan.
 */
function verifyMemberLive(membersSheet, cachedStudent, expectedId) {
  if (!cachedStudent || !cachedStudent.row) return null;

  const values = membersSheet
    .getRange(cachedStudent.row, 1, 1, 5)
    .getDisplayValues()[0];

  const liveId = canonicalSheetStudentId(values[0]);
  const wantedId = canonicalStudentId(expectedId);

  if (!liveId || liveId !== wantedId) return null;

  return {
    id: liveId,
    name: String(values[1] || "").trim(),
    email: String(values[2] || "").trim(),
    grade: values[3],
    status: String(values[4] || "").trim(),
    row: cachedStudent.row
  };
}

function readMemberRow(membersSheet, row, expectedId) {
  if (!row || row < 2) return null;

  const values = membersSheet
    .getRange(row, 1, 1, 5)
    .getDisplayValues()[0];

  const liveId = canonicalSheetStudentId(values[0]);
  const wantedId = canonicalStudentId(expectedId);

  if (!liveId || liveId !== wantedId) return null;

  return {
    id: liveId,
    name: String(values[1] || "").trim(),
    email: String(values[2] || "").trim(),
    grade: values[3],
    status: String(values[4] || "").trim(),
    row: row
  };
}

function findStudentByEmail(membersSheet, email) {
  email = String(email || "").trim().toLowerCase();
  if (!email) return null;

  const index = getMemberIndex(membersSheet);
  const ids = Object.keys(index);

  for (let i = 0; i < ids.length; i++) {
    const s = index[ids[i]];
    if (String(s.email || "").trim().toLowerCase() === email) return s;
  }

  return null;
}

function findActiveEvent(eventsSheet, currentTime) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("active_event");

  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        parsed.id &&
        currentTime.getTime() >= parsed.opens &&
        currentTime.getTime() <= parsed.closes
      ) {
        return parsed;
      }
    } catch (error) {
      cache.remove("active_event");
    }
  }

  const lastRow = eventsSheet.getLastRow();
  if (lastRow < 2) return null;

  const events = eventsSheet.getRange(2, 1, lastRow - 1, 6).getValues();

  for (let i = 0; i < events.length; i++) {
    const eventId = String(events[i][0] || "").trim();
    if (!eventId || !events[i][2] || !events[i][3] || !events[i][4]) continue;

    const eventDate = new Date(events[i][2]);
    const openTime = new Date(events[i][3]);
    const closeTime = new Date(events[i][4]);

    const opens = new Date(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate(),
      openTime.getHours(),
      openTime.getMinutes(),
      0
    );

    const closes = new Date(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate(),
      closeTime.getHours(),
      closeTime.getMinutes(),
      59
    );

    if (currentTime >= opens && currentTime <= closes) {
      const event = {
        id: eventId,
        name: String(events[i][1] || ""),
        points: Number(events[i][5]) || 0,
        opens: opens.getTime(),
        closes: closes.getTime()
      };

      try {
        cache.put("active_event", JSON.stringify(event), EVENT_CACHE_SECONDS);
      } catch (error) {}

      return event;
    }
  }

  return null;
}

function getScannerStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventsSheet = ss.getSheetByName("EVENTS");

  if (!eventsSheet) {
    return { success: false, active: false, message: "EVENTS sheet is missing." };
  }

  const now = new Date();
  const event = findActiveEvent(eventsSheet, now);

  if (!event) {
    return {
      success: true,
      active: false,
      serverTime: formatTimestamp(now),
      message: "No active check-in event."
    };
  }

  return {
    success: true,
    active: true,
    eventId: event.id,
    name: event.name,
    points: event.points,
    opens: Utilities.formatDate(
      new Date(event.opens),
      Session.getScriptTimeZone(),
      "h:mm a"
    ),
    closes: Utilities.formatDate(
      new Date(event.closes),
      Session.getScriptTimeZone(),
      "h:mm a"
    ),
    serverTime: formatTimestamp(now)
  };
}

function attendanceExists(attendanceSheet, studentId, eventId) {
  const id = canonicalStudentId(studentId);
  const wantedEvent = normalizeEventId(eventId);

  if (!id || !wantedEvent) return false;

  const lastRow = attendanceSheet.getLastRow();
  if (lastRow < 2) return false;

  // The ATTENDANCE sheet is the source of truth.
  // Do NOT trust a long-lived duplicate cache here: during testing or
  // manual corrections, an attendance row may be deleted while a stale
  // cache entry remains and falsely says "Already checked in."
  const rows = attendanceSheet
    .getRange(2, 2, lastRow - 1, 3)
    .getDisplayValues();

  for (let i = rows.length - 1; i >= 0; i--) {
    const rowId = canonicalSheetStudentId(rows[i][0]);
    const rowEvent = normalizeEventId(rows[i][2]);

    if (rowId === id && rowEvent === wantedEvent) {
      return true;
    }
  }

  return false;
}

function writeStudentIdCell(cell, studentId) {
  const id = studentIdForStorage(studentId);

  // IMPORTANT: format the destination as Plain Text BEFORE writing.
  // The old code formatted after setValues(), which allowed Sheets to
  // coerce "0620829" into the number 620829 first.
  cell.setNumberFormat("@");
  cell.setValue(id);
}

function appendMemberRow(sheet, studentId, name, email, grade, status) {
  const id = canonicalStudentId(studentId);
  if (!id) throw new Error("Invalid Student ID.");

  const row = sheet.getLastRow() + 1;

  // Student ID must be formatted as text BEFORE it is written.
  writeStudentIdCell(sheet.getRange(row, 1), id);

  sheet.getRange(row, 2, 1, 4).setValues([[
    name,
    email,
    grade,
    status
  ]]);

  return row;
}

function appendAttendanceRow(
  sheet,
  timestamp,
  studentId,
  name,
  eventId,
  eventName,
  entryType,
  enteredBy
) {
  const id = canonicalStudentId(studentId);
  if (!id) throw new Error("Invalid Student ID.");

  const row = sheet.getLastRow() + 1;

  // Write non-ID values in two efficient operations.
  sheet.getRange(row, 1).setValue(timestamp);
  writeStudentIdCell(sheet.getRange(row, 2), id);
  sheet.getRange(row, 3, 1, 5).setValues([[
    name,
    eventId,
    eventName,
    entryType,
    enteredBy
  ]]);
}

function appendPointsRow(
  sheet,
  timestamp,
  studentId,
  name,
  category,
  reason,
  points,
  entryType,
  enteredBy
) {
  const id = canonicalStudentId(studentId);
  if (!id) throw new Error("Invalid Student ID.");

  const row = sheet.getLastRow() + 1;

  sheet.getRange(row, 1).setValue(timestamp);
  writeStudentIdCell(sheet.getRange(row, 2), id);
  sheet.getRange(row, 3, 1, 6).setValues([[
    name,
    category,
    reason,
    points,
    entryType,
    enteredBy
  ]]);
}

function checkInData(rawStudentId) {
  const id = canonicalStudentId(rawStudentId);

  if (!id) {
    return { success: false, code: "INVALID_ID", message: "Invalid Student ID." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName("MEMBERS");
  const eventsSheet = ss.getSheetByName("EVENTS");
  const attendanceSheet = ss.getSheetByName("ATTENDANCE");
  const pointsSheet = ss.getSheetByName("POINTS");

  if (!membersSheet || !eventsSheet || !attendanceSheet || !pointsSheet) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      message: "One or more required sheets are missing."
    };
  }

  const student = findStudentById(membersSheet, id);

  if (!student) {
    return {
      success: false,
      code: "STUDENT_NOT_FOUND",
      studentId: id,
      message: "Student not found."
    };
  }

  if (String(student.status).trim().toLowerCase() !== "active") {
    return {
      success: false,
      code: "MEMBER_INACTIVE",
      studentId: id,
      name: student.name,
      message: "Membership is not active."
    };
  }

  const scanTime = new Date();
  const currentEvent = findActiveEvent(eventsSheet, scanTime);

  if (!currentEvent) {
    return {
      success: false,
      code: "ATTENDANCE_CLOSED",
      studentId: id,
      name: student.name,
      message: "Attendance is currently closed."
    };
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(4000);
  } catch (error) {
    return {
      success: false,
      code: "SYSTEM_BUSY",
      message: "Another check-in is processing. Please scan again."
    };
  }

  try {
    const verified = verifyMemberLive(membersSheet, student, id);

    if (!verified) {
      return {
        success: false,
        code: "STUDENT_NOT_FOUND",
        studentId: id,
        message: "Student is not registered."
      };
    }

    if (String(verified.status).trim().toLowerCase() !== "active") {
      return {
        success: false,
        code: "MEMBER_INACTIVE",
        studentId: id,
        name: verified.name,
        message: "Membership is not active."
      };
    }

    if (attendanceExists(attendanceSheet, id, currentEvent.id)) {
      return {
        success: false,
        code: "ALREADY_CHECKED_IN",
        studentId: id,
        name: verified.name,
        event: currentEvent.name,
        message: "Already checked in."
      };
    }

    appendAttendanceRow(
      attendanceSheet,
      scanTime,
      id,
      verified.name,
      currentEvent.id,
      currentEvent.name,
      "AUTO",
      "SYSTEM"
    );

    appendPointsRow(
      pointsSheet,
      scanTime,
      id,
      verified.name,
      "Attendance",
      currentEvent.name,
      currentEvent.points,
      "AUTO",
      "SYSTEM"
    );
return {
      success: true,
      code: "CHECKIN_SUCCESS",
      registered: false,
      studentId: id,
      name: verified.name,
      grade: verified.grade,
      event: currentEvent.name,
      points: currentEvent.points,
      timestamp: formatTimestamp(scanTime)
    };
  } finally {
    lock.releaseLock();
  }
}

function registerNewMember(rawStudentId, name, email, grade) {
  const id = canonicalStudentId(rawStudentId);

  name = String(name || "").trim().replace(/\s+/g, " ");
  email = String(email || "").trim().toLowerCase();
  grade = String(grade || "").trim();

  if (!id) return { success: false, code: "INVALID_ID", message: "Invalid Student ID." };
  if (!name || name.length < 3) return { success: false, message: "Please enter your full name." };
  if (!email || !isValidEmail(email)) return { success: false, message: "Please enter a valid school email." };
  if (!["9", "10", "11", "12"].includes(grade)) {
    return { success: false, message: "Please select a valid grade." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName("MEMBERS");
  const eventsSheet = ss.getSheetByName("EVENTS");
  const attendanceSheet = ss.getSheetByName("ATTENDANCE");
  const pointsSheet = ss.getSheetByName("POINTS");

  if (!membersSheet || !eventsSheet || !attendanceSheet || !pointsSheet) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      message: "One or more required sheets are missing."
    };
  }

  const currentEvent = findActiveEvent(eventsSheet, new Date());

  if (!currentEvent) {
    return {
      success: false,
      code: "ATTENDANCE_CLOSED",
      message: "Registration is available only during an active Model UN event."
    };
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(4000);
  } catch (error) {
    return { success: false, code: "SYSTEM_BUSY", message: "System is busy. Please try again." };
  }

  try {
    invalidateMemberCache();

    const existing = findStudentById(membersSheet, id);

    if (existing) {
      return {
        success: false,
        code: "ALREADY_REGISTERED",
        studentId: id,
        name: existing.name,
        message: "This Student ID is already registered. Scan it again to check in."
      };
    }

    const emailOwner = findStudentByEmail(membersSheet, email);

    if (emailOwner) {
      return {
        success: false,
        code: "EMAIL_ALREADY_REGISTERED",
        name: emailOwner.name,
        message: "That email is already registered."
      };
    }

    const timestamp = new Date();

    const newMemberRow = appendMemberRow(
      membersSheet,
      id,
      name,
      email,
      grade,
      "Active"
    );

    // Force the member write to commit before checking it.
    SpreadsheetApp.flush();

    const created = readMemberRow(
      membersSheet,
      newMemberRow,
      id
    );

    if (!created) {
      return {
        success: false,
        code: "REGISTRATION_WRITE_FAILED",
        message: "Member registration did not save. Attendance was not recorded."
      };
    }

    // Only invalidate the member cache after the row is confirmed.
    invalidateMemberCache();

    appendAttendanceRow(
      attendanceSheet,
      timestamp,
      id,
      name,
      currentEvent.id,
      currentEvent.name,
      "AUTO",
      "SYSTEM"
    );

    appendPointsRow(
      pointsSheet,
      timestamp,
      id,
      name,
      "Attendance",
      currentEvent.name,
      currentEvent.points,
      "AUTO",
      "SYSTEM"
    );
return {
      success: true,
      code: "REGISTRATION_SUCCESS",
      registered: true,
      studentId: id,
      name: name,
      grade: grade,
      totalPoints: currentEvent.points,
      event: currentEvent.name,
      points: currentEvent.points,
      timestamp: formatTimestamp(timestamp)
    };
  } finally {
    lock.releaseLock();
  }
}

function getMemberStatus(studentId) {
  const id = canonicalStudentId(studentId);

  if (!id) {
    return { success: false, code: "INVALID_ID", message: "Invalid Student ID." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName("MEMBERS");
  const pointsSheet = ss.getSheetByName("POINTS");

  if (!membersSheet || !pointsSheet) {
    return {
      success: false,
      code: "SYSTEM_ERROR",
      message: "MEMBERS or POINTS sheet is missing."
    };
  }

  const student = findStudentById(membersSheet, id);

  if (!student) {
    return { success: false, code: "STUDENT_NOT_FOUND", message: "Student not found." };
  }

  return {
    success: true,
    studentId: id,
    name: student.name,
    grade: student.grade,
    status: student.status,
    totalPoints: getTotalPointsForStudent(pointsSheet, id)
  };
}

function getTotalPointsForStudent(pointsSheet, studentId) {
  const id = canonicalStudentId(studentId);
  if (!id) return 0;

  const lastRow = pointsSheet.getLastRow();
  if (lastRow < 2) return 0;

  const rows = pointsSheet
    .getRange(2, 2, lastRow - 1, 5)
    .getValues();

  let total = 0;

  for (let i = 0; i < rows.length; i++) {
    if (canonicalSheetStudentId(rows[i][0]) === id) {
      total += Number(rows[i][4]) || 0;
    }
  }

  return total;
}

function findEventById(eventsSheet, eventId) {
  const wanted = normalizeEventId(eventId);
  if (!wanted) return null;

  const lastRow = eventsSheet.getLastRow();
  if (lastRow < 2) return null;

  const rows = eventsSheet.getRange(2, 1, lastRow - 1, 6).getValues();

  for (let i = 0; i < rows.length; i++) {
    if (normalizeEventId(rows[i][0]) === wanted) {
      return {
        id: String(rows[i][0]).trim(),
        name: rows[i][1],
        date: rows[i][2],
        openTime: rows[i][3],
        closeTime: rows[i][4],
        points: Number(rows[i][5]) || 0
      };
    }
  }

  return null;
}

function addManualAttendance(studentId, eventId, officerName, reason) {
  const id = canonicalStudentId(studentId);
  if (!id) throw new Error("Invalid Student ID.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName("MEMBERS");
  const eventsSheet = ss.getSheetByName("EVENTS");
  const attendanceSheet = ss.getSheetByName("ATTENDANCE");
  const pointsSheet = ss.getSheetByName("POINTS");

  const student = findStudentById(membersSheet, id);
  if (!student) throw new Error("Student is not registered.");

  if (String(student.status).trim().toLowerCase() !== "active") {
    throw new Error("Membership is not active.");
  }

  const event = findEventById(eventsSheet, eventId);
  if (!event) throw new Error("Event not found.");

  officerName = String(officerName || "").trim();
  reason = String(reason || "").trim();

  if (!officerName) throw new Error("Officer name is required.");

  const lock = LockService.getScriptLock();
  lock.waitLock(4000);

  try {
    if (attendanceExists(attendanceSheet, id, event.id)) {
      throw new Error(student.name + " already has attendance for " + event.name + ".");
    }

    const timestamp = new Date();

    appendAttendanceRow(
      attendanceSheet,
      timestamp,
      id,
      student.name,
      event.id,
      event.name,
      "MANUAL",
      officerName
    );

    appendPointsRow(
      pointsSheet,
      timestamp,
      id,
      student.name,
      "Attendance",
      reason ? event.name + " — " + reason : event.name,
      event.points,
      "MANUAL",
      officerName
    );
return {
      success: true,
      studentId: id,
      name: student.name,
      event: event.name,
      points: event.points,
      timestamp: formatTimestamp(timestamp)
    };
  } finally {
    lock.releaseLock();
  }
}

function addManualPoints(studentId, category, reason, points, officerName) {
  const id = canonicalStudentId(studentId);
  if (!id) throw new Error("Invalid Student ID.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName("MEMBERS");
  const pointsSheet = ss.getSheetByName("POINTS");

  const student = findStudentById(membersSheet, id);
  if (!student) throw new Error("Student is not registered.");

  category = String(category || "").trim();
  reason = String(reason || "").trim();
  officerName = String(officerName || "").trim();
  points = Number(points);

  if (!category) throw new Error("Please select a category.");
  if (!reason) throw new Error("A reason is required.");
  if (!officerName) throw new Error("Officer name is required.");
  if (!Number.isFinite(points) || points === 0) {
    throw new Error("Points must be a non-zero number.");
  }

  const timestamp = new Date();

  appendPointsRow(
    pointsSheet,
    timestamp,
    id,
    student.name,
    category,
    reason,
    points,
    "MANUAL",
    officerName
  );

  return {
    success: true,
    studentId: id,
    name: student.name,
    category: category,
    points: points,
    timestamp: formatTimestamp(timestamp)
  };
}

function getOfficerDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName("MEMBERS");
  const eventsSheet = ss.getSheetByName("EVENTS");

  if (!membersSheet || !eventsSheet) {
    throw new Error("MEMBERS or EVENTS sheet is missing.");
  }

  const memberIndex = getMemberIndex(membersSheet);

  const students = Object.keys(memberIndex)
    .map(function(id) {
      const s = memberIndex[id];
      return { id: id, name: s.name, grade: s.grade, status: s.status };
    })
    .filter(function(s) {
      return String(s.status).trim().toLowerCase() === "active";
    })
    .sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });

  const events = [];
  const lastRow = eventsSheet.getLastRow();

  if (lastRow >= 2) {
    const rows = eventsSheet.getRange(2, 1, lastRow - 1, 2).getValues();

    for (let i = 0; i < rows.length; i++) {
      const id = String(rows[i][0] || "").trim();
      const name = String(rows[i][1] || "").trim();
      if (id && name) events.push({ id: id, name: name });
    }
  }

  return { students: students, events: events };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function formatTimestamp(timestamp) {
  return Utilities.formatDate(
    timestamp,
    Session.getScriptTimeZone(),
    "M/d/yyyy h:mm:ss a"
  );
}

function outputApiResult(result, callback) {
  callback = String(callback || "").trim();

  if (!callback) {
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput("Invalid callback.")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(result) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/*************************************************************
 * GOOGLE SHEETS OFFICER DASHBOARD LAUNCHER
 *
 * Adds a "Model UN" menu to the spreadsheet.
 * This does not redeploy the dashboard; it opens the currently
 * deployed Officer Dashboard web app.
 *************************************************************/

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Model UN")
    .addItem("Open Officer Dashboard", "openOfficerDashboard")
    .addToUi();
}

function openOfficerDashboard() {
  const ui = SpreadsheetApp.getUi();
  const baseUrl = ScriptApp.getService().getUrl();

  if (!baseUrl) {
    ui.alert(
      "Officer Dashboard unavailable",
      "This Apps Script project must be deployed as a Web app before the Officer Dashboard can be opened.",
      ui.ButtonSet.OK
    );
    return;
  }

  const officerUrl = baseUrl + "?page=officer";

  const html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html>' +
    '<html>' +
      '<head>' +
        '<base target="_blank">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '</head>' +
      '<body style="' +
        'margin:0;' +
        'padding:28px;' +
        'font-family:Arial,sans-serif;' +
        'background:#f4f6f9;' +
        'color:#222;' +
        'text-align:center;' +
      '">' +
        '<div style="' +
          'background:#fff;' +
          'border-radius:14px;' +
          'padding:24px;' +
          'box-shadow:0 2px 10px rgba(0,0,0,.10);' +
        '">' +
          '<div style="font-size:22px;font-weight:700;margin-bottom:8px;">' +
            'Model UN Officer Dashboard' +
          '</div>' +
          '<div style="font-size:14px;color:#666;margin-bottom:22px;line-height:1.45;">' +
            'Manual attendance and point adjustments are permanently recorded.' +
          '</div>' +
          '<a href="' + officerUrl + '" ' +
            'style="' +
              'display:inline-block;' +
              'background:#3367b7;' +
              'color:white;' +
              'text-decoration:none;' +
              'font-weight:700;' +
              'padding:12px 20px;' +
              'border-radius:8px;' +
            '">' +
            'Open Officer Dashboard' +
          '</a>' +
        '</div>' +
      '</body>' +
    '</html>'
  )
    .setWidth(430)
    .setHeight(230);

  ui.showModalDialog(html, "Model UN");
}

