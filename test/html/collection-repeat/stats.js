
var stats = angular.element('<div id="stats" style="pointer-events: none; position: absolute; bottom: 0; left: 0; right: 0; height: 120px; background: rgba(0,0,0,0.25); color: white;">')[0];
var appended = false;
setInterval(function() {
  if (!appended) document.body.appendChild(stats);
  appended = true;
  stats.innerHTML = outputTimes();
}, 750);
