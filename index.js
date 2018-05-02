'use strict';

// Node.js core modules
var fs = require('fs');
var path = require('path');

// Userland modules
var _ = require('lodash');
var fastCsv = require('fast-csv');
var TogglClient = require('toggl-api');
var limit = require('simple-rate-limiter');



function isReadableMode(fsStatsMode) {
  /*jshint bitwise:false */

  // Pseudo-constant
  var CAN_READ_MASK = 4;

  return !!(CAN_READ_MASK & parseInt((fsStatsMode & parseInt('777', 8)).toString(8)[0], 10));
}

function isExistingFile(somePath) {
  var stats;
  try {
    stats = !!somePath && fs.statSync(somePath);
  }
  catch (err) {}
  return !!stats && stats.isFile();
}

function isReadableFile(somePath) {
  var stats;
  try {
    stats = !!somePath && fs.statSync(somePath);
  }
  catch (err) {}
  return !!stats && stats.isFile() && isReadableMode(stats.mode);
}


function getTogglBaseData(togglClient, callback) {
  if (!(togglClient instanceof TogglClient)) {
    throw new Error('You must provide a valid TogglClient instance');
  }

  togglClient.getUserData({ 'with_related_data': true }, function(err, userData) {
    if (err) {
      callback(err);
      return;
    }

    console.log('togglUserData:\n' + JSON.stringify(userData, null, 2));

    /*jshint camelcase:false */
    delete userData.time_entries;
    /*jshint camelcase:true */

    var relatedDataProperties = ['workspaces', 'clients', 'projects', 'tasks', 'tags'];

    var baseData = {};
    baseData.user = _.omit(userData, relatedDataProperties);

    _.forEach(relatedDataProperties, function(relatedDataProp) {
      baseData[_.camelCase(relatedDataProp)] = userData[relatedDataProp];
    });

    callback(null, baseData);
  });
}


function findByNameOrId(arr, name) {
  var val;
  for (var i = 0, len = arr.length; i < len; i++) {
    val = arr[i];
    if (val) {
      if (
        (typeof name === 'number' && name >= 0 && name === val.id) ||
        (typeof name === 'string' && name === val.name)
      ) {
        return val;
      }
    }
  }
  return null;
}


function filterByNameOrId(arr, name) {
  return _.filter(
    arr,
    function(val) {
      return (
        val &&
        (
          (typeof name === 'number' && name >= 0 && name === val.id) ||
          (typeof name === 'string' && name === val.name)
        )
      );
    }
  );
}


function parseDurationString(durationStr) {
  var durationSec = null;
  if (typeof durationStr === 'string' && durationStr) {
    if (/^\d+$/.test(durationStr)) {
      durationSec = parseInt(durationStr, 10);
    }
    else {
      var matches = durationStr.match(/^([\d]{1,2}):([\d]{1,2}):([\d]{1,2})$/);
      if (matches && matches.length === 4) {
        durationSec = (
          parseInt(matches[3], 10) +            // sec
          (60 * parseInt(matches[2], 10)) +     // min --> sec
          (60 * 60 * parseInt(matches[1], 10))  // hr  --> sec
        );
      }
    }
  }
  else if (typeof durationStr === 'number' && durationStr >= 0) {
    durationSec = parseInt(durationStr, 10);
  }
  return durationSec;
}


function getFirstPropertyName(obj, propNames) {
  propNames =
    _.map(
      propNames,
      function(propName) {
        return _.trim(_.camelCase(propName));
      }
    );

  var keys = _.keys(obj),
      propName = null;

  for (var i = 0, len = keys.length; i < len; i++) {
    if (_.contains(propNames, _.trim(_.camelCase(keys[i])))) {
      propName = keys[i];
      break;
    }
  }
  return propName;
}


function getFirstProperty(obj, propNames) {
  var propName = getFirstPropertyName(obj, propNames);
  return typeof propName === 'string' ? obj[propName] : null;
}


function transformTogglTimeEntryData(timeEntryData, togglBaseData) {
  /*
  description: (string, strongly suggested to be used)
  wid: workspace ID (integer, required if pid or tid not supplied)
  pid: project ID (integer, not required)
  tid: task ID (integer, not required)
  billable: (boolean, not required, default false, available for pro workspaces)
  start: time entry start time (string, required, ISO 8601 date and time)
  stop: time entry stop time (string, not required, ISO 8601 date and time)
  duration: time entry duration in seconds. If the time entry is currently running, the duration attribute contains a negative value, denoting the start of the time entry in seconds since epoch (Jan 1 1970). The correct duration can be calculated as current_time + duration, where current_time is the current time in seconds since epoch. (integer, required)
  created_with: the name of your client app (string, required)
  tags: a list of tag names (array of strings, not required)
  duronly: should Toggl show the start and stop time of this time entry? (boolean, not required)
  at: timestamp that is sent in the response, indicates the time item was last updated
  */

  var fullName = getFirstProperty(timeEntryData, ['User']) || togglBaseData.user.fullname;
  var email = getFirstProperty(timeEntryData, ['Email']) || togglBaseData.user.email;

  var matchingTasks      = filterByNameOrId(togglBaseData.tasks,      getFirstProperty(timeEntryData, ['Task']));
  var matchingProjects   = filterByNameOrId(togglBaseData.projects,   getFirstProperty(timeEntryData, ['Project']));
  var matchingClients    = filterByNameOrId(togglBaseData.clients,    getFirstProperty(timeEntryData, ['Client']));
  var matchingWorkspaces = filterByNameOrId(togglBaseData.workspaces, getFirstProperty(timeEntryData, ['Workspace']));

  var taskId      = matchingTasks.length      === 1 ? matchingTasks[0].id      : null;
  var projectId   = matchingProjects.length   === 1 ? matchingProjects[0].id   : null;
  var clientId    = matchingClients.length    === 1 ? matchingClients[0].id    : null;
  var workspaceId = matchingWorkspaces.length === 1 ? matchingWorkspaces[0].id : null;

  if (!taskId && projectId) {
    taskId = (_.findWhere(matchingTasks, { pid: projectId }) || {}).id;
  }

  if (!projectId && taskId) {
    projectId = (_.findWhere(matchingProjects, { id: _.findWhere(matchingTasks, { id: taskId }).pid }) || {}).id;
  }

  if (!clientId && projectId) {
    clientId = (_.findWhere(matchingClients, { id: _.findWhere(matchingProjects, { id: projectId }).cid }) || {}).id;
  }
    
  if (!projectId && clientId) {
    projectId = (_.findWhere(matchingProjects, { cid: clientId }) || {}).id;
  }

  if (!workspaceId && clientId) {
    workspaceId = (_.findWhere(matchingWorkspaces, { id: _.findWhere(matchingClients,  { id: clientId  }).wid }) || {}).id;
  }
  if (!workspaceId && projectId) {
    workspaceId = (_.findWhere(matchingWorkspaces, { id: _.findWhere(matchingProjects, { id: projectId }).wid }) || {}).id;
  }
  if (!workspaceId && taskId) {
    workspaceId = (_.findWhere(matchingWorkspaces, { id: _.findWhere(matchingTasks,    { id: taskId    }).wid }) || {}).id;
  }
  if (!workspaceId) {
    /*jshint camelcase:false */
    workspaceId = togglBaseData.user.default_wid;
    /*jshint camelcase:true */
  }


  var startDateProp = getFirstProperty(timeEntryData, ['Start date', 'Start']);
  var startTimeProp = getFirstProperty(timeEntryData, ['Start time']);
  var startDate = startDateProp ? new Date(startDateProp + (startTimeProp ? ' ' + startTimeProp : '')) : null;

  var endDateProp = getFirstProperty(timeEntryData, ['End date', 'Stop date', 'End', 'Stop']);
  var endTimeProp = getFirstProperty(timeEntryData, ['End time', 'Stop time']);
  var endDate = endDateProp ? new Date(endDateProp + (endTimeProp ? ' ' + endTimeProp : '')) : null;

  var durationSec = parseDurationString(getFirstProperty(timeEntryData, ['Duration']));

  var tagNames = _.uniq(_.compact((getFirstProperty(timeEntryData, ['Tags']) || '').split(/[,\|]/)));


  return {
    fullname:    fullName,
    email:       email,
    wid:         workspaceId,
    cid:         clientId,
    pid:         projectId,
    tid:         taskId,
    description: getFirstProperty(timeEntryData, ['Description']),
    billable:    /^\s*(true|yes|y|1)\s*$/i.test(getFirstProperty(timeEntryData, ['Billable'])),
    start:       startDate ? startDate.toISOString() : null,
    stop:        endDate   ? endDate.toISOString()   : null,
    duration:    endDate && startDate ? Math.round((endDate - startDate) / 1000) : durationSec,
    tags:        tagNames
  };

}


function validateTogglTimeEntry(timeEntry, togglBaseData) {
  console.log('Revised timeEntry:\n' + JSON.stringify(timeEntry, null, 2));

  if (!togglBaseData) {
    console.warn('Invalid: no Toggl baseData');
    return false;
  }

  if (!timeEntry) {
    console.warn('Invalid: no Toggl timeEntry');
    return false;
  }

  // If fullname does not match the authenticated user's full name...
  if (typeof timeEntry.fullname === 'string' && _.trim(timeEntry.fullname)) {
    if (!(togglBaseData.user && typeof togglBaseData.user.fullname === 'string' && _.trim(togglBaseData.user.fullname) && _.trim(timeEntry.fullname) === _.trim(togglBaseData.user.fullname))) {
      console.warn('Invalid: user fullname in timeEntry does not match user fullname in Toggl baseData');
      return false;
    }
  }

  // If email does not match the authenticated user's email address...
  if (typeof timeEntry.email === 'string' && _.trim(timeEntry.email)) {
    if (!(togglBaseData.user && typeof togglBaseData.user.email === 'string' && _.trim(togglBaseData.user.email) && _.trim(timeEntry.email).toLowerCase() === _.trim(togglBaseData.user.email).toLowerCase())) {
      console.warn('Invalid: user email in timeEntry does not match user email in Toggl baseData');
      return false;
    }
  }

  // Verify that all the relationships align
  var task      = (timeEntry.tid && findByNameOrId(togglBaseData.tasks,      timeEntry.tid)) || null;
  var project   = (timeEntry.pid && findByNameOrId(togglBaseData.projects,   timeEntry.pid)) || null;
  var client    = (timeEntry.cid && findByNameOrId(togglBaseData.clients,    timeEntry.cid)) || null;
  var workspace = (timeEntry.wid && findByNameOrId(togglBaseData.workspaces, timeEntry.wid)) || null;

  // Fetch all of the tags
  var tags =
    (timeEntry.tags && timeEntry.tags.length > 0) ?
      _.filter(
        togglBaseData.tags,
        function(tag) {
          return (
            _.find(
              timeEntry.tags,
              function(tagName) {
                return (
                  _.trim(tag.name).toLowerCase() === _.trim(tagName).toLowerCase() &&
                  (!workspace || workspace.id === tag.wid)
                );
              }
            ) != null
          );
        }
      ) :
      null;


  if (!task) {
    // If tid is included (optional) but does not correspond to an existing task accessible to the authenticated user...
    if (timeEntry.tid) {
      console.warn('Invalid: taskId (tid) in timeEntry does not correspond to an existing task in Toggl baseData');
      return false;
    }
  }
  else {
    // If the task's wid does not correspond to an existing workspace accessible to the authenticated user...
    if (task.wid !== workspace.id) {
      console.warn('Invalid: task\'s workspaceId (wid) in timeEntry does not correspond to the workspace specified in timeEntry');
      return false;
    }
    // If the task's pid does not correspond to an existing project accessible to the authenticated user...
    if (task.pid !== project.id) {
      console.warn('Invalid: task\'s projectId (pid) in timeEntry does not correspond to the project specified in timeEntry (1)');
      return false;
    }
  }

  // If pid does not correspond to an existing project accessible to the authenticated user...
  if (!project) {
    console.warn('Invalid: projectId (pid) in timeEntry does not correspond to an existing project in Toggl baseData');
    return false;
  }
  else {
    // If the task's pid does not correspond to an existing project accessible to the authenticated user...
    if (task && task.pid !== project.id) {
      console.warn('Invalid: task\'s projectId (pid) in timeEntry does not correspond to the project specified in timeEntry (2)');
      return false;
    }
  }

  // If cid does not correspond to an existing client accessible to the authenticated user...
  if (!client) {
    console.warn('Invalid: clientId (cid) in timeEntry does not correspond to an existing client in Toggl baseData');
    return false;
  }
  else {
    // If the project's cid does not correspond to an existing client accessible to the authenticated user...
    if (project && project.cid !== client.id) {
      console.warn('Invalid: project\'s clientId (cid) in timeEntry does not correspond to the client specified in timeEntry');
      return false;
    }
  }

  // If wid does not correspond to an existing workspace accessible to the authenticated user...
  if (!workspace) {
    console.warn('Invalid: workspaceId (wid) in timeEntry does not correspond to an existing workspace in Toggl baseData');
    return false;
  }
  else {
    // If the client's wid does not correspond to an existing workspace accessible to the authenticated user...
    if (client && client.wid !== workspace.id) {
      console.warn('Invalid: client\'s workspaceId (wid) in timeEntry does not correspond to the workspace specified in timeEntry');
      return false;
    }

    // If the project's wid does not correspond to an existing workspace accessible to the authenticated user...
    if (project && project.wid !== workspace.id) {
      console.warn('Invalid: project\'s workspaceId (wid) in timeEntry does not correspond to the workspace specified in timeEntry');
      return false;
    }

    // If the task's wid does not correspond to an existing workspace accessible to the authenticated user...
    if (task && task.wid !== workspace.id) {
      console.warn('Invalid: task\'s workspaceId (wid) in timeEntry does not correspond to the workspace specified in timeEntry');
      return false;
    }
  }

  if (tags && tags.length > 0) {
    // If any tags' wid does not correspond to an existing workspace accessible to the authenticated user...
    if (workspace && _.some(tags, function(tag) { return tag.wid !== workspace.id; })) {
      console.warn('Invalid: not all tags\' workspaceId (wid) in timeEntry corresponded to the workspace specified in timeEntry; tags = ' + JSON.stringify(_.pluck(tags, 'name')));
      return false;
    }
  }

  return true;
}




//var togglBulkEntry =
module.exports = {

  upload: function(opts) {

    //
    // Input parsing
    //

    if (!opts.csv) {
      throw new Error('No CSV file path provided');
    }

    if (!opts.togglApiToken && process.env.TOGGL_API_TOKEN) {
      opts.togglApiToken = process.env.TOGGL_API_TOKEN;
    }
    if (!opts.togglApiToken) {
      throw new Error('No Toggl API token provided');
    }

    var absoluteCsvPath = path.resolve(opts.csv);
    var explicitHeaders = null;

    if (
      opts.headers && opts.headers.length > 0 && typeof opts.headers[0] === 'string' &&
      _.trim(opts.headers[0])
    ) {
      explicitHeaders = opts.headers;
    }


    //
    // Input validation
    //

    if (!isExistingFile(absoluteCsvPath)) {
      throw new Error('No CSV file exists at the provided path: ' + JSON.stringify(absoluteCsvPath));
    }

    if (!isReadableFile(absoluteCsvPath)) {
      throw new Error('The CSV file at the provided path is not readable: ' + JSON.stringify(absoluteCsvPath));
    }


    // Create the Toggl API Client
    var toggl = new TogglClient({ apiToken: opts.togglApiToken });

    // Wrap the Toggl `createTimeEntry` method to limit requests to no more than 1 request per second.
    // This is to account for the LeakyBucket rate limiting algorithm that Toggl's API enforces.
    // More info: https://github.com/toggl/toggl_api_docs#the-api-format
    var createTimeEntry =
      limit(
        function(toggl, timeEntry, callback) {
          return toggl.createTimeEntry(timeEntry, callback);
        }
      )
      .to(1)
      .per(1000);


    //
    // Go!
    //
    getTogglBaseData(toggl, function(err, togglBaseData) {

      console.log('togglBaseData:\n' + JSON.stringify(togglBaseData, null, 2));

      fastCsv
        .fromPath(absoluteCsvPath, { headers: explicitHeaders || true })
        .transform(function(timeEntryData) {
          console.log('timeEntryData:\n' + JSON.stringify(timeEntryData, null, 2));
          return transformTogglTimeEntryData(timeEntryData, togglBaseData);
        })
        .validate(function(timeEntry) {
          return validateTogglTimeEntry(timeEntry, togglBaseData);
        })
        .on('data-invalid', function(data) {
          console.warn('WARNING: Invalid data!\n' + JSON.stringify(data, null, 2));

          //TODO:
          // Do something with this invalid row!
        })
        .on('data', function(timeEntry) {
          console.log('Processing a new timeEntry item from the CSV file:\n' + JSON.stringify(timeEntry, null, 2));

          createTimeEntry(toggl, timeEntry, function(err, result) {
            if (err) {
              throw new Error('An unexpected error occurred while trying to createTimeEntry via the Toggle API:\n' + err);
            }

            console.log('New timeEntry created with "id": ' + result.id);
          });
        })
        .on('end', function() {
          console.log('All done processing the CSV file!');
        });

    });

  }

};
