'use strict';


module.exports = function(grunt) {

  var gruntConfig = {

    jshint: {
      options: {
        jshintrc: true
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      src: {
        src: ['*.js', '!Gruntfile.js']
      }
    }

  };

  //console.log(gruntConfig);

  // Project configuration.
  grunt.initConfig(gruntConfig);

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');

  // Default task.
  grunt.registerTask('default', ['jshint']);

  // TravisCI task.
  grunt.registerTask('travis', ['jshint']);

};
