toggl-report
============
Node.js script capable of using Toggl API to:
- export Toggl entries to xlsx spreadsheet
- sync Toggl entries to Anuko Time Tracker

Works on Linux and Windows

NOTE: in current version 'node_modules/xlsx/xlsx.js' is modified, see report.js for details. Should be removed once officially supported.

Configuring
-----------

- copy the draft config to config.js
- set preferences:
  - set your [toggl API token](https://www.toggl.com/app/profile)
  - set your workspaceId
  - (optional) set your userId (if any filtering od accessible users is desired)
  - set your project->project name & id map (some kind of convention is used here, project name `other/day off` stands for `other` project in Anuko and `day off` task in Anuko)

Usage
-----------
- setup the config with timespan that you would like to report
- `node main sync` to sync to Anuko Time Tracker
- `node main export` to export to xlsx
