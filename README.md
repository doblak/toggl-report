toggl-report
============
NOTE: in current version 'node_modules/xlsx/xlsx.js' is modified, see report.js for details. Should be removed once officially supported.

Configuring
-----------

- copy the draft config to config.js
- set any preferences:
  - set your [toggl API token](https://www.toggl.com/app/profile)
  - set your workspaceId
  - set your project->project name & id map

Usage
-----------
- set the timespan that you would like to report
- node ./report.js & away