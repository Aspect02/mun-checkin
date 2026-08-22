# Model UN Check-In & Points System

A barcode-based attendance and points system designed for school Model United Nations clubs.

Students scan the barcode on their school ID. The system identifies the student, verifies their membership, records attendance for the current event, and automatically awards the appropriate number of points.

New students can also register directly from the scanner.

---

# What This System Does

The system is designed to make Model UN attendance essentially automatic.

When a student scans their school ID:

1. The scanner reads their Student ID.
2. The system checks whether the student exists in the `MEMBERS` sheet.
3. The system checks whether there is currently an active event.
4. The system checks whether that student has already attended that event.
5. If everything is valid:
   - attendance is recorded;
   - event points are awarded;
   - the student's name, grade, and point information are displayed.

A student cannot receive attendance points twice for the same event.

If the Student ID is not registered, the scanner opens the **New Member Registration** screen instead.

---

# System Overview

The project has three main parts:

```text
Student ID
    ↓
Web Scanner (index.html)
    ↓
Google Apps Script
    ↓
Google Sheets
```

### 1. Scanner

`index.html`

Runs in a web browser and uses the computer's camera to scan the barcode on a student ID.

### 2. Backend

`Code.gs`

Runs through Google Apps Script.

It handles:

- member lookup
- registration
- event detection
- duplicate attendance prevention
- attendance logging
- points
- member information
- communication between the scanner and Google Sheets

### 3. Database

A Google Sheets spreadsheet acts as the database.

No traditional database server is required.

---

# Requirements

You need:

- a Google account
- Google Sheets
- Google Apps Script
- a computer with a camera
- Google Chrome or another modern Chromium browser
- Python 3 for running the scanner locally

You do **not** need:

- Node.js
- npm
- React
- a paid server
- a traditional SQL database

---

# Part 1 — Download the Project

Open a Terminal.

Clone the repository:

```bash
git clone https://github.com/Aspect02/mun-checkin.git
```

Enter the project folder:

```bash
cd mun-checkin
```

You should now have the project files on your computer.

---

# Part 2 — Create the Google Sheet

Create a new Google Sheets spreadsheet.

For example:

```text
Model UN Club Management
```

The spreadsheet needs the following sheets:

```text
MEMBERS
EVENTS
ATTENDANCE
POINTS
```

The names should be written exactly as shown above.

---

# Part 3 — MEMBERS Sheet

Create a sheet named:

```text
MEMBERS
```

Add these headers:

| Column | Header |
|---|---|
| A | Student ID |
| B | Name |
| C | Email |
| D | Grade |
| E | Status |

Example:

| Student ID | Name | Email | Grade | Status |
|---|---|---|---|---|
| 0620829 | Example Student | 0620829@students.dadeschools.net | 12 | Active |

## Important: Student IDs

Student IDs are seven digits.

For example:

```text
0620829
```

The leading zero is important.

Do not intentionally change:

```text
0620829
```

into:

```text
620829
```

The backend is designed to preserve the seven-digit Student ID.

---

# Part 4 — EVENTS Sheet

Create a sheet named:

```text
EVENTS
```

Use these columns:

| Column | Header |
|---|---|
| A | Event ID |
| B | Event Name |
| C | Date |
| D | Open Time |
| E | Close Time |
| F | Points |

Example:

| Event ID | Event Name | Date | Open Time | Close Time | Points |
|---|---|---|---|---|---|
| GB-001 | General Body Meeting | 8/25/2026 | 2:30 PM | 4:00 PM | 2 |

The scanner only accepts attendance while an event is active.

For example:

```text
Open Time: 2:30 PM
Close Time: 4:00 PM
```

A scan at:

```text
3:15 PM
```

will be accepted.

A scan at:

```text
4:30 PM
```

will not.

## Event IDs

Every event should have a unique Event ID.

Examples:

```text
GB-001
GB-002
TRAINING-001
CONFERENCE-001
```

Do not reuse an Event ID for two different events.

The system uses the combination of:

```text
Student ID + Event ID
```

to prevent duplicate attendance.

---

# Part 5 — ATTENDANCE Sheet

Create a sheet named:

```text
ATTENDANCE
```

Use these headers:

| Column | Header |
|---|---|
| A | Timestamp |
| B | Student ID |
| C | Name |
| D | Event ID |
| E | Event Name |
| F | Entry Type |
| G | Entered By |

You normally do not need to enter information into this sheet manually.

The system writes attendance records automatically.

Example:

| Timestamp | Student ID | Name | Event ID | Event Name | Entry Type | Entered By |
|---|---|---|---|---|---|---|
| 8/25/2026 3:04:21 PM | 0620829 | Example Student | GB-001 | General Body Meeting | AUTO | SYSTEM |

---

# Part 6 — POINTS Sheet

Create a sheet named:

```text
POINTS
```

Use these headers:

| Column | Header |
|---|---|
| A | Timestamp |
| B | Student ID |
| C | Name |
| D | Category |
| E | Reason |
| F | Points |
| G | Entry Type |
| H | Entered By |

Example:

| Timestamp | Student ID | Name | Category | Reason | Points | Entry Type | Entered By |
|---|---|---|---|---|---|---|---|
| 8/25/2026 3:04:21 PM | 0620829 | Example Student | Attendance | General Body Meeting | 2 | AUTO | SYSTEM |

The scanner automatically adds the number of points assigned to the active event.

---

# Part 7 — Install the Google Apps Script Backend

Open your Google Sheet.

Select:

```text
Extensions
→ Apps Script
```

Google Apps Script will open.

You should see a file named:

```text
Code.gs
```

Delete the default code inside it.

Open the project's:

```text
Code.gs
```

Copy the entire file.

Paste it into the Google Apps Script editor.

Save the project.

---

# Part 8 — Run Initial Setup

Inside Apps Script, find:

```javascript
setupOptimizations
```

Select it from the function menu.

Click:

```text
Run
```

The first time you run it, Google may ask for authorization.

Choose your Google account and approve the requested permissions.

This setup configures important spreadsheet formatting, including Student ID columns.

You normally only need to run this setup once.

---

# Part 9 — Deploy the Backend

In Apps Script, click:

```text
Deploy
→ New deployment
```

Select:

```text
Web app
```

Configure the deployment.

### Execute as

Choose:

```text
Me
```

### Who has access

Choose:

```text
Anyone
```

This is important because the scanner needs to communicate with the backend without requiring every student to sign into your Google account.

Click:

```text
Deploy
```

Google will give you a Web App URL.

It will look similar to:

```text
https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec
```

Copy this URL.

---

# Part 10 — Connect the Scanner to Your Backend

Open:

```text
index.html
```

in a code editor.

For example:

- Visual Studio Code
- Sublime Text
- TextEdit in plain-text mode
- another source-code editor

Find the backend URL configuration.

It will look similar to:

```javascript
const API_BASE =
  "https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec";
```

Replace the existing URL with the URL from your Apps Script deployment.

For example:

```javascript
const API_BASE =
  "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
```

Save the file.

---

# Part 11 — Test the Backend Before Testing the Scanner

Before using the camera, make sure Apps Script works.

Open this URL in your browser:

```text
YOUR_APPS_SCRIPT_URL?action=status
```

For example:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=status
```

If an event is currently active, you should receive a response containing information about that event.

If there is no active event, the backend should report that attendance is currently closed.

If you receive a Google permission or access page instead, check your deployment settings.

The deployment should normally be:

```text
Execute as: Me
Who has access: Anyone
```

---

# Part 12 — Run the Scanner on Your Computer

Do not simply double-click `index.html`.

The camera works more reliably when the page is served through localhost.

## macOS

Open Terminal.

Navigate to the project folder.

Example:

```bash
cd ~/Downloads/mun-checkin
```

Then run:

```bash
python3 -m http.server 8000
```

You should see something similar to:

```text
Serving HTTP on 0.0.0.0 port 8000
```

Now open Chrome and visit:

```text
http://localhost:8000
```

The scanner should appear.

---

# Part 13 — Allow Camera Access

The first time the scanner starts, Chrome should ask:

```text
Allow localhost to use your camera?
```

Choose:

```text
Allow
```

If you accidentally denied it:

1. Open `localhost:8000`.
2. Click the site controls icon beside the address bar.
3. Find **Camera**.
4. Change it to **Allow**.
5. Reload the page.

---

# Part 14 — Test With a Registered Student

First create a test student in `MEMBERS`.

For example:

```text
Student ID: 0620829
Name: Test Student
Email: 0620829@students.dadeschools.net
Grade: 12
Status: Active
```

Then create an event in `EVENTS` whose date and time include the current time.

Example:

```text
Event ID: TEST-001
Event Name: System Test
Date: today's date
Open Time: 1:00 PM
Close Time: 6:00 PM
Points: 2
```

Run the scanner.

Scan the student's ID.

A successful scan should:

1. recognize the Student ID;
2. find the student;
3. display the student's name;
4. add one row to `ATTENDANCE`;
5. add one row to `POINTS`;
6. award the event's point value.

---

# Part 15 — Test Duplicate Protection

Scan the exact same student again during the same event.

The system should report:

```text
Already checked in
```

It should **not** create:

- another attendance row;
- another points row.

Duplicate detection uses:

```text
Student ID + Event ID
```

Therefore the same student can attend future events normally.

---

# Part 16 — New Member Registration

If the scanner reads a valid Student ID that does not exist in `MEMBERS`, the system opens the registration screen.

The student enters:

```text
Full Name
School Email
Grade
```

The Student ID comes from the scanned card.

After registration, the system:

1. creates the member;
2. verifies that registration succeeded;
3. records attendance;
4. awards the event points.

Attendance should never be created for an unknown Student ID before registration succeeds.

---

# School Email Shortcut

For supported school accounts, students can enter their seven-digit Student ID in the School Email field.

For example:

```text
0620829
```

The scanner can suggest:

```text
0620829@students.dadeschools.net
```

This makes registration faster.

Students may still enter their complete school email manually.

---

# Important Shared-Computer Privacy Recommendation

This system is intended to be used by many students on one computer.

Do **not** run the scanner from your normal personal Chrome profile if that profile contains saved names, addresses, emails, passwords, or payment information.

Browsers can sometimes display saved autofill information even when a website attempts to disable autofill.

For meetings, use either:

```text
Chrome Guest Mode
```

or create a dedicated browser profile such as:

```text
Model UN Check-In
```

Do not save personal information in that profile.

---

# Normal Meeting Procedure

Once the system has been configured, officers do **not** need to repeat the installation process every meeting.

Before a meeting:

### 1. Add the event

Open `EVENTS` and create the meeting.

Example:

```text
GB-005
September General Body Meeting
9/15/2026
2:30 PM
4:00 PM
2 points
```

### 2. Start the scanner

Open Terminal:

```bash
cd ~/path/to/mun-checkin
```

Run:

```bash
python3 -m http.server 8000
```

### 3. Open the scanner

Visit:

```text
http://localhost:8000
```

### 4. Verify the event

The scanner should show the active event.

### 5. Students scan

Students present their school ID barcode to the camera.

That is all that should normally be required during a meeting.

---

# Updating the Scanner

If you modify `index.html`, simply save the file.

Because localhost serves the file directly, restart/reload the browser page.

A hard refresh on macOS Chrome is:

```text
Command + Shift + R
```

You normally do not need to redeploy Apps Script when only `index.html` changes.

---

# Updating Code.gs

If you modify:

```text
Code.gs
```

saving the Apps Script project is **not enough** for the production Web App.

You must deploy a new version.

Go to:

```text
Deploy
→ Manage deployments
→ Edit
```

Choose:

```text
New version
```

Then:

```text
Deploy
```

Keep the existing deployment instead of creating a completely new Web App whenever possible.

This keeps the same `/exec` URL, meaning you do not need to change `index.html`.

---

# Troubleshooting

## "Invalid Student ID"

Student IDs are expected to represent seven-digit school IDs.

Example:

```text
0620829
```

Manual entry should contain all seven digits.

The scanner may normalize supported barcode reads when necessary.

---

## Student ID loses the first zero

Correct:

```text
0620829
```

Incorrect:

```text
620829
```

Student ID columns should be treated as text.

Run:

```javascript
setupOptimizations()
```

from Apps Script.

The backend should format the destination ID cell as Plain Text **before** writing the Student ID.

---

## "Already checked in"

Check the `ATTENDANCE` sheet.

Look for a row containing both:

```text
same Student ID
+
same Event ID
```

If such a row exists, this message is correct.

The student has already received attendance for that event.

If you are testing and intentionally want to scan again, remove the appropriate test attendance/points records first.

---

## "Attendance is currently closed"

There is no active event.

Check:

```text
EVENTS
```

Verify:

- today's date is correct;
- Open Time is correct;
- Close Time is correct;
- the current time falls between them.

---

## "Student not found"

The Student ID is not currently registered in:

```text
MEMBERS
```

The new-member registration screen should appear.

---

## Registration does not save

Confirm that:

1. `MEMBERS` exists;
2. the column names/order are correct;
3. the Apps Script deployment is current;
4. Apps Script has permission to modify the spreadsheet;
5. the Student ID is valid;
6. the email is valid;
7. a grade was selected.

After changing `Code.gs`, remember to create a **new deployment version**.

---

## Scanner works in one Chrome profile but not another

First test:

```text
YOUR_APPS_SCRIPT_URL?action=status
```

from the affected browser profile.

If Google asks the user to sign in or reports access denied, check the Apps Script deployment.

It should normally be:

```text
Execute as: Me
Who has access: Anyone
```

---

## Camera does not work

Make sure you are using:

```text
http://localhost:8000
```

rather than opening the HTML directly as:

```text
file:///...
```

Also verify that Chrome has camera permission.

---

## GitHub is blocked on school Wi-Fi

The scanner does **not** need GitHub to operate after the repository has been downloaded.

Run the scanner locally:

```bash
python3 -m http.server 8000
```

Then use:

```text
http://localhost:8000
```

GitHub is only needed to download/update the source code.

The scanner itself communicates with Google Apps Script.

---

# Recommended Sheet Rules

To avoid accidental database problems:

### MEMBERS

Officers may edit this sheet.

Do not casually change Student IDs.

### EVENTS

Officers use this sheet to schedule meetings and set points.

Every Event ID should be unique.

### ATTENDANCE

Normally let the system manage this sheet.

Avoid manually adding attendance unless you understand how duplicate detection works.

### POINTS

Normally let the system manage automatic attendance points.

If manual points are supported through the officer tools, use those rather than editing rows directly.

---

# Recommended Event Naming

Use predictable Event IDs.

For example:

```text
GB-001
GB-002
GB-003

TRAINING-001
TRAINING-002

CONF-MIAMUN-2026
CONF-MICSUN-2026
```

The human-readable name can be longer:

```text
September General Body Meeting
Crisis Training
Miami Model United Nations Conference
```

The Event ID should remain unique.

---

# Security

Do not place private API keys, passwords, or personal credentials inside `index.html`.

Remember that frontend HTML/JavaScript can be viewed by anyone using the scanner.

The Apps Script Web App should perform important validation on the backend rather than trusting the browser.

The backend should always verify:

- Student ID
- membership
- membership status
- active event
- duplicate attendance

before awarding points.

---

# Data Flow

A normal scan follows this path:

```text
School ID barcode
        │
        ▼
   index.html
        │
        │ Student ID
        ▼
Google Apps Script
        │
        ├──── MEMBERS
        │       │
        │       └── Is this student registered and active?
        │
        ├──── EVENTS
        │       │
        │       └── What event is active?
        │
        ├──── ATTENDANCE
        │       │
        │       └── Has this student already checked in?
        │
        └──── POINTS
                │
                └── Award event points
```

---

# Quick Start for Officers

Once everything has already been installed:

```text
1. Open the Google Sheet
2. Add today's event to EVENTS
3. Open Terminal
4. cd into mun-checkin
5. Run: python3 -m http.server 8000
6. Open http://localhost:8000
7. Allow camera access
8. Begin scanning IDs
```

That is the normal day-to-day workflow.

---

# Quick Start for Developers

Clone:

```bash
git clone https://github.com/Aspect02/mun-checkin.git
cd mun-checkin
```

Run:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

After frontend changes:

```text
Command + Shift + R
```

After `Code.gs` changes:

```text
Save
→ Deploy
→ Manage deployments
→ Edit
→ New version
→ Deploy
```

---

# Before Using This at a Real Meeting

Run these tests:

- [ ] Registered member scans successfully
- [ ] Student ID retains all seven digits
- [ ] Attendance row is created
- [ ] Points row is created
- [ ] Correct event points are awarded
- [ ] Second scan says "Already checked in"
- [ ] Second scan does not award additional points
- [ ] Unknown Student ID opens registration
- [ ] Unknown student is not logged before registration
- [ ] Registration creates the member
- [ ] Newly registered member receives attendance
- [ ] Newly registered member receives event points
- [ ] Inactive member is rejected
- [ ] Scanner rejects attendance outside the event window
- [ ] Camera works in the browser profile used at meetings
- [ ] Personal browser autofill information is not available on the kiosk

Do not deploy the system for a real meeting until these tests pass.

---

# Project

Model UN Check-In & Points System

Repository:

https://github.com/Aspect02/mun-checkin
