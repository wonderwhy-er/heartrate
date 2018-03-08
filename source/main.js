
var videoElement = document.querySelector('video');
var videoSelect = document.querySelector('select#videoSource');
var selectors = [videoSelect];

function gotDevices(deviceInfos) {
    // Handles being called several times to update labels. Preserve values.
    var values = selectors.map(function (select) {
        return select.value;
    });
    selectors.forEach(function (select) {
        while (select.firstChild) {
            select.removeChild(select.firstChild);
        }
    });
    for (var i = 0; i !== deviceInfos.length; ++i) {
        var deviceInfo = deviceInfos[i];
        var option = document.createElement('option');
        option.value = deviceInfo.deviceId;
        if (deviceInfo.kind === 'videoinput') {
            option.text = deviceInfo.label || 'camera ' + (videoSelect.length + 1);
            videoSelect.appendChild(option);
        } else {
            console.log('Some other kind of source/device: ', deviceInfo);
        }
    }
    selectors.forEach(function (select, selectorIndex) {
        if (Array.prototype.slice.call(select.childNodes).some(function (n) {
                return n.value === values[selectorIndex];
            })) {
            select.value = values[selectorIndex];
        }
    });
}

navigator.mediaDevices.enumerateDevices().then(gotDevices).catch(handleError);

function gotStream(stream) {
    window.stream = stream; // make stream available to console
    videoElement.srcObject = stream;
    // Refresh button list in case labels have become available
    return navigator.mediaDevices.enumerateDevices();
}

function start() {
    if (window.stream) {
        window.stream.getTracks().forEach(function (track) {
            track.stop();
        });
    }
    var videoSource = videoSelect.value;
    var constraints = {
        video: {
            deviceId: videoSource ? {exact: videoSource} : undefined,
            width: {exact: 320},
            height: {exact: 180}
        }
    };
    navigator.mediaDevices.getUserMedia(constraints).then(gotStream).then(gotDevices).catch(handleError);
}


videoSelect.onchange = start;

start();

function handleError(error) {
    alert('navigator.getUserMedia error: ' + error.name + error.message);
}

var v = videoElement;
var canvas = document.getElementById('c');
var context = canvas.getContext('2d');

var timeDiv = document.getElementById('time');
var graphEl = document.getElementById('graph');
var bufferSize = document.getElementById('bufferSize');
var graph = [];
var light = new TimeSeries();
var beat = new TimeSeries();
var rate = new TimeSeries();
var buffer = [];

var beats = new TimeSeries();
var first, second;

function getImageValue() {
    var cw = v.clientWidth;
    var ch = v.clientHeight;
    canvas.width = 80;
    canvas.height = 45;
    context.drawImage(v, 0, 0, 80, 45);
    var data = context.getImageData(0, 0, 80, 45).data;
    var sum = 0;
    for (var i = 0; i < data.length; i += 4) {
        sum += data[i];
    }
    return sum;
}


function getPolyVal(x1,y1,x2,y2,x3,y3,x) {
    return ((x-x2)*(x-x3)*y1)/((x1-x2)*(x1-x3)) + ((x-x1)*(x-x3)*y2)/((x2-x1)*(x2-x3)) +((x-x2)*(x-x1)*y3)/((x3-x2)*(x3-x1));
}

function getPolyMaxPoint(x1,y1,x2,y2,x3,y3) {
    return ((-1)*(x1-x2)*(x1-x3)*(x2-x3))*(((x2+x3)*y1)/((x1-x2)*(x1-x3)) + ((x1+x3)*y2)/((x2-x1)*(x2-x3)) + ((x2+x1)*y3)/((x3-x2)*(x3-x1)))/(2*((x1-x3)*(y2) - (x2-x3)*(y1) - (x1-x2)*(y3)))
}

for (var i = 0; i < 10; i++) {
    var x1 = 1;
    var x2 = 2;
    var x3 = 3;
    var y1 = Math.random();
    var y2 = Math.random();
    var y3 = Math.random();

    if(
        getPolyVal(x1,y1,x2,y2,x3,y3,x1)!=y1 ||
        getPolyVal(x1,y1,x2,y2,x3,y3,x2)!=y2 ||
        getPolyVal(x1,y1,x2,y2,x3,y3,x3)!=y3
    ) {
        throw(new Error('ups'));
    } else {
        console.log('poly ok');
    }

    var maxX = getPolyMaxPoint(x1,y1,x2,y2,x3,y3);
    var maxY = getPolyVal(x1,y1,x2,y2,x3,y3,maxX);
    var stepLeft = getPolyVal(x1,y1,x2,y2,x3,y3,maxX-0.1);
    var stepRight = getPolyVal(x1,y1,x2,y2,x3,y3,maxX+0.1);
    if((maxY-stepLeft)*(maxY-stepRight)<0) {
        throw(new Error('ups'));
    }
}

function checkBeats(current) {
    var result = 0;
    if (first && second) {
        var dif1 = first.value - second.value;
        var dif2 = second.value - current.value;
        var change = dif1 * dif2;
        if (dif1 * dif2 < 0) {
            result = dif2 / Math.abs(dif2);
            var time = getPolyMaxPoint(first.time,first.value,second.time,second.value,current.time,current.value);
        }
    }
    first = second;
    second = current;
    return {
        sign: result,
        time: time
    };
}

var lastPositiveBeat;
function frame() {
    var time = new Date().getTime();
    var currentLight = getImageValue();

    buffer.push(currentLight);
    buffer = buffer.splice(Math.max(0, buffer.length - Number(bufferSize.value)), buffer.length);

    var smoothLight = buffer.reduce((sum, value) => sum + value, 0) / buffer.length;
    light.append(time, smoothLight);
    var beat = checkBeats({
        time: time,
        value: smoothLight
    });
    var beatsPerSec;
    if( beat.sign>0) {
        if(lastPositiveBeat) {
            beatsPerSec = 60000/(beat.time - lastPositiveBeat.time);
            rate.append(beat.time,beatsPerSec);
            timeDiv.innerHTML = beatsPerSec;
        }
        lastPositiveBeat = beat;
    }
    beats.append(time, beat ? beat.sign : 0 );



    requestAnimationFrame(frame);
}
frame();

var lightChart = new SmoothieChart();
lightChart.addTimeSeries(light, {strokeStyle: 'rgba(0, 255, 0, 1)', fillStyle: 'rgba(0, 255, 0, 0.2)', lineWidth: 2});
lightChart.streamTo(document.getElementById("lightChart"), 30);

var beatChart = new SmoothieChart();
beatChart.addTimeSeries(beats, {strokeStyle: 'rgba(0, 255, 0, 1)', fillStyle: 'rgba(0, 255, 0, 0.2)', lineWidth: 2});
beatChart.streamTo(document.getElementById("beatChart"), 30);

var rateChart = new SmoothieChart();
rateChart.addTimeSeries(rate, {strokeStyle: 'rgba(0, 255, 0, 1)', fillStyle: 'rgba(0, 255, 0, 0.2)', lineWidth: 2});
rateChart.streamTo(document.getElementById("rateChart"), 30);