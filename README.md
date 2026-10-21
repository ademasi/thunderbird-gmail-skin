# Gmail-inspired Thunderbird desktop skin

An experimental, independently developed skin for Thunderbird: a compact inbox,
existing tags as colored chips before the subject, and a conversation reader
with a Back button and message actions. No Google affiliation or Gmail login is
required. Your mailbox remains with its existing provider.

Current version: **0.7.1**. Developed and manually checked on **Thunderbird 153.5
ESR on macOS**. The privileged companion is deliberately restricted to Thunderbird
153.x. Other Thunderbird versions, Windows, and Linux are unverified. This is not
an iOS skin, and it does not add cross-client Exchange tag synchronization.

## What is included

- Light/dark Gmail-inspired shell, compose button, selections, rows, and stars.
- Existing Thunderbird tag names/colors displayed as chips, without migration.
- Hidden From/Subject header text and Spam column; UI font size follows Thunderbird.
- Click a message to replace the list with the reader; Back restores the list.
- Archive, spam, delete, unread, Move, Labels, and a Follow-Up clock in the reader.
- Return to the full list after archiving, with the native preview collapsed.
- Optional reversible column-layout scripts: From → Subject with chips → Date.

## Requirements

Python 3.9+ for the installer/build; Node.js 18+ only to run tests. No Python or
Node packages are downloaded or required.

Install **Thunderbird Conversations** separately from Thunderbird's add-on
manager for the conversation cards and inline replies shown in this project.
The clock requires **mailmindr / Follow-Ups**; it opens that add-on's reminder
form. Gmail-style snoozing is not implemented; mailmindr's icebox behavior needs
its own configuration. Tag Popup is optional: the skin uses native Thunderbird
tags, including any previously created with Tag Popup. These third-party add-ons
are not bundled or automatically installed.

## Install

1. In Thunderbird, open Help → Troubleshooting Information → Profile Folder and
   locate the profile you want to customize. Quit Thunderbird completely.
2. Download and extract the source ZIP, or clone this repository.
3. In a terminal in this directory, run (replace the example path):

   ```sh
   python3 install.py "/absolute/path/to/your/Thunderbird/profile"
   ```

   On Windows use `py -3` instead of `python3` if appropriate.
4. Restart Thunderbird. Review any add-on permission prompt. Select a built-in
   Light, Dark, or System theme, Classic layout, Compact density, and **Table View**. Enable threaded
   sorting. The companion starts with the message preview collapsed.
5. Optionally enable Tags folder-pane mode and the folder-pane header.

The installer builds the XPI from the included source, installs it and both CSS
files, preserves existing userChrome.css rules, and enables the custom-stylesheet
preference. It saves original affected files under `.gmail-skin-install` **inside
the selected profile**. It does not copy accounts, passwords, messages, tags,
sessions, or someone else's preferences into your profile. Do not share that
snapshot: pre-existing profile files may contain personal settings.

Alternatively build with `python3 build.py` and install the resulting XPI through
Add-ons Manager → gear → Install Add-on From File. That installs only the
companion; it does not install the shell CSS or enable the stylesheet preference.

### Optional column layout

With the intended ordinary folder open, paste the entire
`scripts/apply-gmail-columns.js` into Thunderbird's Error Console and execute it.
This changes that folder's column order/visibility and shared sender/subject
widths. It saves a snapshot to `gmail-skin-columns.json` in your profile.
Only one folder snapshot is supported: preserve/rename it before configuring a
different folder. To restore, open the original folder and run
`scripts/restore-columns.js`. Column changes are separate from installer rollback.
You can also arrange columns manually using Thunderbird's column picker.

## Uninstall / rollback

Quit Thunderbird and run from this directory:

```sh
python3 install.py "/absolute/path/to/your/Thunderbird/profile" --uninstall
```

This restores the original CSS, user.js, companion package (if any), and custom
stylesheet preference, preserving the snapshot in a dated folder. It refuses to
overwrite installer-managed files edited since installation; inspect the saved
originals if that happens. Restore optional column changes separately as above.
Mail actions you performed through the toolbar are real mail actions, and are
not undone by uninstalling. Uninstall before installing a newer release.

## Source and access

`chrome/` contains presentation CSS. `inline-labels/` contains the MailExtension
and its privileged experiment. `reading.js` delegates mail actions to native
Thunderbird commands and opens the installed mailmindr scheduler. `labels.js`
reads native tag definitions/message keywords and renders chips. `build.py`
packages these sources without a network step.

The experiment has broad Thunderbird UI/profile privileges; it is more powerful
than an ordinary theme. Review the source before installing. The bundled code
has no telemetry or network requests, but mail actions use your configured mail
service normally. Compatibility can break when Thunderbird internals change.
Archive actions follow Thunderbird's selected-message/thread semantics; messages
found only by Conversations, such as additional Sent messages, are not always
included in the skin toolbar's action scope.

## Development and validation

```sh
node --test tests/*.test.cjs
python3 build.py
```

Nine focused tests cover tag rendering, row reuse, click filtering, move detection,
and returning to list-only mode from an initially expanded preview. These are
mock-based tests; they do not replace testing in a disposable Thunderbird profile.
Live UI checks covered opening/returning, toolbar menus, and the reminder dialog.
The latest archive return fix has automated coverage but has not been verified by
archiving live mail. Try a separate test profile before using it for daily mail.

Installer verification: `python3 tests/installer_test.py` runs install/uninstall
against temporary profiles, including existing customization and conflict refusal.
Build a source ZIP and SHA-256 checksum with `python3 package.py`; packaging uses
an explicit allowlist, excluding generated packages and profile recovery data.

## Publishing to GitHub

Create a repository with this directory's contents (not a Thunderbird profile
and not the original development folder). The included MIT license allows reuse.
Keep generated XPI files out of Git history; attach the source ZIP, checksum and,
optionally, the built XPI as release assets tagged `v0.7.1`. The source ZIP is the
complete installable bundle; the XPI alone supplies only the companion features.
Mark the first release experimental and include the compatibility/testing limits
above. No repository has been published by the package preparation step.


## Checkbox selection (0.4.0)

The native selection checkbox column is visible before the star controls. Tick
individual rows or use the column header to toggle selection of the current
view. Selection uses Thunderbird's native thread semantics, including child
messages when a collapsed thread is selected. Checking rows keeps the reader
closed and displays a bulk toolbar for archive, spam, delete, unread, move, and
labels. The clock is disabled for multiple messages because Follow-Ups schedules
one message at a time. Clear selection hides the toolbar. A checked label means
all selected messages have it; selecting an unchecked label applies it to all,
and unchecking a checked label removes it from all. Mixed tags appear unchecked.

Verified two-row selection, correct count, label menu, and clearing in the live
inbox without executing mail mutations. A mock regression test verifies that
Archive receives the native multi-message selection. Column visibility/order
changes are applied while the companion runs; its saved in-memory originals are
restored on shutdown.


## Action-bar polish (0.4.1)

Arrow-only Back button with accessible name and tooltip. Consistent 20 px SVG
icons inside 36 px circular buttons, 2 px spacing, and vertical separators
between navigation, mail actions, follow-up actions, and move/labels. Bulk
selection uses an X icon for Clear selection and retains the selected count.
The 44 px bar keeps visible keyboard focus and a distinct disabled state.
Verified the reading bar visually, Back returning to the list, bulk selection,
and clearing selection in Thunderbird. Seven regression tests pass; no mail
mutation was executed during UI verification.

For a portable rollback, keep the source ZIP for your previous release. Quit
Thunderbird, uninstall using the installer from the currently installed release,
then install the previous release. This applies to profiles managed by the
portable installer; local development rollback scripts are machine-specific and
are intentionally excluded from public packages.


## Selection polish (0.4.2)

Native header/row checkboxes are consistently 18 px, with stronger hover and
checked-state contrast. Selected rows keep a light blue #c2dbff background on
hover and when focus moves to the toolbar. High-contrast mode retains native
selection colors. The bulk toolbar replaces the folder heading while selecting,
rather than inserting a second heading row. Clearing selection, opening the
reader, changing folders, or disabling the companion restores the heading.
Seven regression tests pass. Live UI checks covered compact checkbox appearance,
selected-row color, multiple selection, toolbar placement, and heading restoration;
no archive/delete/move/tag operations were executed during verification.


## Compact dates (0.5.0)

The message-list Date column shows a time for messages dated today, abbreviated
month/day for other messages in the current year, and includes the year for
older mail. Formatting follows the UI language and the computer's local time
zone. Hover reveals the full weekday, date, year, time (including seconds), and
zone. Dates refresh at local midnight and when the window regains focus.

This changes only rendered text and tooltip data, not message timestamps or
sorting. The Received column and conversation-reader timestamps remain native.
The renderer preserves native row accessibility descriptions and removes its
hook, timers, and display changes on shutdown. Nine tests pass, including local
midnight/year boundaries, invalid dates, virtual-row reuse, tooltip translation,
and restoring native strings. Live Thunderbird cells were verified to display
short dates with full timestamp tooltips.


## Dark mode (0.6.0)

Choose **Tools → Add-ons and Themes → Themes → Dark → Enable**. Light restores
the light palette; System theme — auto follows the operating-system appearance.
The skin responds to the theme's `prefers-color-scheme` setting without a restart
once its CSS is installed. Dark surfaces cover the sidebar, message list,
heading, compose button, selection, and reading/bulk action bars. Inline label
chips use darker tints with light text; tag definitions and colors are unchanged.
High-contrast mode retains native colors.

Conversations supplies its own existing dark header/card styles. The skin does
not invert or rewrite email HTML bodies: those remain subject to Thunderbird's
message-color settings and the message author's explicit colors. Third-party
add-on toolbar icons and custom themes may need their own adjustments.
Nine existing regression tests pass. Manually verified live Light/Dark switching, dark list/labels, dark selected rows and bulk toolbar, loaded conversation cards and reader toolbar, Back navigation, and return to Light. The original Light theme was restored after testing.

## Searchable label picker (0.7.0)

Select one or more messages, or open a conversation, then press **L** (without modifiers).
The Labels toolbar button opens the same picker. Type part of a label name to filter;
search ignores case and supports Unicode names. Use Up/Down to navigate, Space to
check or uncheck the focused label, and Escape or a click outside to close.

Changes apply immediately through Thunderbird's native tag command to the current
selection. Checked means every selected message has the label; mixed means only
some do. Checking a mixed label applies it to all selected messages. Existing tag
names, keys, colors, and assignments are preserved. Changing folders or selection
closes the picker so it cannot act on a stale selection.

Bare L replaces Thunderbird's Ignore Subthread shortcut in the mail browsing pane.
It does not override typing in search fields/editors, modified shortcuts, or other
tabs. This shortcut is part of the desktop skin; it does not add an iOS shortcut or
change the account's existing tag synchronization support.

Validation: 13 automated tests pass, including search, shortcut guards, legacy/mixed
tag states, native bulk add/remove delegation, stale selection rejection and focus
restoration. Live Thunderbird checks cover opening from list/conversation views,
search matches/no matches, arrow navigation and Escape. Real mail tags were not
changed during testing.

## Gmail-style label panel (0.7.1)

The L picker now reads **Label as:** and follows the supplied Gmail reference:
plain square checkboxes without color dots, regular-weight heading, a wider panel,
compact rows, underlined search with a magnifying glass, and a divided footer.
**Create new** opens Thunderbird's New Tag dialog; **Manage labels** opens its tag
settings. Native tag metadata, immediate application, search and keyboard navigation
remain unchanged. Theme colors follow Light/Dark. The list scrolls independently of
the heading/search/footer. Ordering remains Thunderbird's existing tag order.

Validation: 13 automated tests pass, including heading and footer native-command
routing. In Thunderbird, L opens the panel, the heading/footer appear, searching
filters labels, and Create new opens New Tag (cancelled without changing tags).
