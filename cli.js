#!/usr/bin/env node

'use strict';


// Local modules
var togglBulkEntry = require('./index');


// NOTE: Arguments will be verified inside of the `upload` method
togglBulkEntry.upload({ csv: process.argv[2], togglApiToken: process.env.TOGGL_API_TOKEN });
