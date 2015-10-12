# node-toggl-bulk-entry
[![GitHub Latest Release](https://badge.fury.io/gh/JamesMGreene%2Fnode-toggl-bulk-entry.svg)](https://github.com/JamesMGreene/node-toggl-bulk-entry) [![Build Status](https://secure.travis-ci.org/JamesMGreene/node-toggl-bulk-entry.svg?branch=master)](https://travis-ci.org/JamesMGreene/node-toggl-bulk-entry) [![Dependency Status](https://david-dm.org/JamesMGreene/node-toggl-bulk-entry.svg?theme=shields.io)](https://david-dm.org/JamesMGreene/node-toggl-bulk-entry) [![Dev Dependency Status](https://david-dm.org/JamesMGreene/node-toggl-bulk-entry/dev-status.svg?theme=shields.io)](https://david-dm.org/JamesMGreene/node-toggl-bulk-entry#info=devDependencies)


A Node.js module for orchestrating a "bulk upload" of time entries from a CSV file to Toggl.com via their API


## Overview

[Toggl](https://www.toggl.com) is a popular platform for tracking billable time. Although Toggl provides an extremely easy way to track time, you may still occasionally fall behind on your time tracking and want to catch up on a large number of missing time entries.

To help satisfy this need, Toggl also provides an official way to manage bulk imports of time entries using their [CSV Import](https://support.toggl.com/csv-import-new/) feature.

Alias, the problem with the CSV Import feature is that it is _only_ available to those with Administrator permissions for the Workspace!

To help fill that gap, you can make use of this Node.js module to consume the same format (or some abridged/alternate formats detailed below) of CSV files and then orchestrate a simulated "bulk upload" of the time entries via the Toggl API.



## Getting Started

```shell
npm install -g toggl-bulk-entry
```


## Module Usage

```js
var togglBulkEntry = require('toggl-bulk-entry');
togglBulkEntry.upload({ csv: './yourBulkTimeEntries.csv', togglApiToken: 'YOUR_TOGGL_API_TOKEN' });
```


## CLI Usage

```shell
TOGGL_API_TOKEN=YOUR_TOGGL_API_TOKEN togglBulkEntry ./yourBulkTimeEntries.csv
```


## CSV Format

The CSV format utilized by this module is based on the [official "CSV Import" format specified by Toggl](https://support.toggl.com/csv-import-new/#format).


### Columns

#### Official Columns

These columns are defined by Toggl.

 - **User**
     - The user's full name as defined in their Toggl account setup, e.g. `"James Greene"`
     - Optional
     - Depends on: **Email**
     - Specific to this module:
         - If provided, it **MUST** match the Toggl-defined value for the user whose API Token is being used
         - Automatically defaults to the Toggl-defined value for the user whose API Token is being used
 - **Email**
     - The user's email address as defined in their Toggl account setup, e.g. `"james.greene@somecompany.biz"`
     - Required by Toggl
     - Specific to this module:
         - Optional for this module
         - If provided, it **MUST** match the Toggl-defined value for the user whose API Token is being used
         - Automatically defaults to the Toggl-defined value for the user whose API Token is being used
 - **Client**
     - The name of the Client that you are tracking time for, e.g. `"My Cat's Startup"`
     - Optional
     - NOTE: Toggl Projects can be created without being attached to a Client
     - Specific to this module:
         - Can also be provided as the associated numerical ID for the Client
         - Can be inferred from the **Project** _if and only if_ the Project name is unique among all projects that the user whose API Token is being used has access to
 - **Project**
     - The name of the Project that you are tracking time for, e.g. `"Public website development"`
     - Optional
     - Specific to this module:
         - Can also be provided as the associated numerical ID for the Project
         - Can be inferred from the **Task** _if and only if_ the Task name is unique among all tasks that the user whose API Token is being used has access to
 - **Task**
     - The name of the Task that you are tracking time for, e.g. `"Create ""Features"" page"`
     - Optional
     - Depends on: **Project**
     - Specific to this module:
         - Can also be provided as the associated numerical ID for the Task
         - Can be inferred from the **Task** _if and only if_ the Task name is unique among all tasks that the user whose API Token is being used has access to
 - **Description**
     - Some description of the work that you are tracking time for, e.g. `"Created intro video"`
     - Optional
     - Depends on: **Email**, **Start date**, **Start time**, **Duration**
     - Specific to this module:
         - Can also be provided as the associated numerical ID for the Project
         - Can be inferred from the **Task** _if and only if_ the Task name is unique among all tasks that the user whose API Token is being used has access to
 - **Billable**
     - Is the work that you are tracking time for Billable to the Client/Project?, e.g. `"Yes"`
     - Optional, defaults to `"No"`
     - Depends on: **Email**, **Start date**, **Start time**, **Duration**
     - Specific to this module:
         - Accepted values:
              - Truthy: `"Yes"`, `"Y"`, `"true"`, `"1"`
              - Falsey: `"No"`, `"N"`, `"false"`, `"0"`
 - **Start date**
     - On what date was this work started?, e.g. `"2015-10-13"` (October 13th, 2015)
     - Required
     - Format: `"YYYY-MM-DD"`
     - Use in combination with **Start time**
 - **Start time**
     - At what time was this work started?, e.g. `"14:30:00"` (2:30 PM)
     - Required
     - Format: `"HH:MM:SS"` (24-hour clock format)
     - Depends on: **Start date**
 - **Duration**
     - How long did you work on it?, e.g. `"01:15:00"` (1.25 hours / 1 hour and 15 minutes)
     - Required
     - Format: `"HH:MM:SS"`
     - Specific to this module:
         - Can also be provided as an integer number of _seconds_ worked, e.g. `"4500"` (1.25 hours / 1 hour and 15 minutes)
 - **Tags**
     - Associated labels for convenience and reporting, e.g. "Development"
     - Optional
     - Format: `"Planning,Dev,Ops"`, "Planning|Dev|Ops", "Planning,Dev|Ops"
     - Specific to this module:
         - Can specify multiple tags, delimited by either commas (`,`), pipes (`|`), or both


#### Unofficial Columns

**IMPORTANT:** _These columns are specific to this module!_

 - **Workspace**
     - The Toggl workspace context in which the time must be tracked, e.g. "SomeCompany.biz Consulting"
     - Optional
     - Specific to this module:
         - Can also be provided as the associated numerical ID for the Workspace
         - Can be inferred from the:
             - **Client**
             - **Project**
             - **Task**
             - default workspace of the user whose API Token is being used
 - **End date** / **Stop date**
     - On what date was this work finished?, e.g. `"2015-10-13"` (October 13th, 2015)
     - Optional
     - Format: `"YYYY-MM-DD"`
     - Use in combination with **End time** / **Stop time**
     - Conflicts with **Duration**
     - When the **Start date**, **Start time**, **End date** / **Stop date**, **End time** / **End time** columns are all present and have values, they will override any set value for **Duration** with their computed duration
 - **End time** / **Stop time**
     - At what time was this work finished?, e.g. `"15:45:00"` (3:45 PM)
     - Optional
     - Format: `"HH:MM:SS"` (24-hour clock format)
     - Depends on: **End date** / **Stop date**
     - Conflicts with: **Duration**, **End** / **Stop**
     - When the **Start date**, **Start time**, **End date** / **Stop date**, **End time** / **End time** columns are all present and have values, their computed duration will override any set value for **Duration**
 - **Start**
     - On what date and at what time was this work started?, e.g. `"2015-10-13 14:30:00"` (October 13th, 2015 @ 2:30 PM)
     - Optional
     - Format: `"YYYY-MM-DD HH:MM:SS"` (time in 24-hour clock format)
     - Conflicts with: **Start date**, **Start time**
 - **End** / **Stop**
     - On what date and at what time was this work finished?, e.g. `"2015-10-13 15:45:00"` (October 13th, 2015 @ 3:45 PM)
     - Optional
     - Format: `"YYYY-MM-DD HH:MM:SS"` (time in 24-hour clock format)
     - Conflicts with: **Duration**, **End date** / **Stop date**, **End time** / **Stop time**
     - When the **Start** and **End** columns are all present and have values, their computed duration will override any set value for **Duration**



### Examples

#### Using Official CSV Format

```
User,Email,Client,Project,Task,Description,Billable,Start date,Start time,Duration,Tags
James Greene,james.greene@somecompany.biz,My Cat's Startup,Public website development,"Create ""Features"" page",Created intro video,Yes,2015-10-13,14:30:00,01:15:00,"Planning,Dev,Ops"
James Greene,james.greene@somecompany.biz,My Cat's Startup,Internal website development,"Create ""Account"" page",Added PayPal integration for billing,Yes,2015-10-12,12:30:00,04:00:00,Planning|Dev|Ops
```


#### Using Unofficial CSV Format

```
Workspace,Client,Project,Task,Description,Billable,Start,End,Tags
SomeCompany.biz Consulting,My Cat's Startup,Public website development,"Create ""Features"" page",Created intro video,Yes,2015-10-13 14:30:00,2015-10-13 15:45:00,"Planning,Dev,Ops"
SomeCompany.biz Consulting,My Cat's Startup,Internal website development,"Create ""Account"" page",Added PayPal integration for billing,Yes,2015-10-12 12:30:00,2015-10-12 16:30:00,Planning|Dev|Ops
```



## Contributing

Contributions welcomed.  :+1:


## License
Copyright (c) 2015 James M. Greene

Licensed under the MIT license.
