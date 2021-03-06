'use strict';

var convert = require('color-convert');

var Characteristic, Service;

module.exports = function (homebridge) {
    console.log("homebridge API version: " + homebridge.version);

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-magichome', 'MagicHome', MagicHomeAccessory, false);
};

function MagicHomeAccessory(log, config, api) {

    this.log = log;
    this.config = config;
    this.name = config.name || 'LED Controller';
    this.setup = config.setup || 'RGBW';
    this.port = config.port || 5577;
    this.ip = config.ip;
    this.color = {H: 0, S: 0, L: 100};
    this.brightness = 100;
    this.purewhite = config.purewhite || false;
    this.func = '';
    this.getColorFromDevice();

}

MagicHomeAccessory.prototype.identify = function (callback) {
    this.log('Identify requested!');
    callback();
};

MagicHomeAccessory.prototype.getServices = function () {
    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Manufacturer, 'ACME Ltd.')
        .setCharacteristic(Characteristic.Model, 'LED-controller')
        .setCharacteristic(Characteristic.SerialNumber, '123456789');

    var lightbulbService = new Service.Lightbulb(this.name);

    lightbulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Hue())
        .on('get', this.getHue.bind(this))
        .on('set', this.setHue.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Saturation())
        .on('get', this.getSaturation.bind(this))
        .on('set', this.setSaturation.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Brightness())
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));

    return [informationService, lightbulbService];

};

// MARK: - UTIL

MagicHomeAccessory.prototype.sendCommand = function (command, callback) {
    var exec = require('child_process').exec;
    var cmd = __dirname + '/flux_led.py ' + this.ip + ' ' + command;
    exec(cmd, callback);
};

MagicHomeAccessory.prototype.getState = function (callback) {
    this.sendCommand('-i', function (error, stdout) {
        var settings = {
            on: false,
            color: {H: 0, S: 0, L: 100},
            brightness: 100
        };
        var colors = stdout.match(/\(\d{1,3}\, \d{1,3}, \d{1,3}\)/g);
        var isOn = stdout.match(/\] ON /g);
        if (isOn && isOn.length > 0) settings.on = true;
        if (colors && colors.length > 0) {
            var converted = convert.rgb.hsl(String(colors).match(/\d{1,3}/g));
            settings.color = {
                H: converted[0],
                S: converted[1],
                L: converted[2]
            };
        }
        var brightness = String(stdout.match(/Brightness: \d{1,3} raw/g)).match(/\d{1,3}/g);
        settings.brightness = Math.round((brightness / 255 ) * 100);
        callback(settings);
    });
};

MagicHomeAccessory.prototype.getColorFromDevice = function () {
    this.getState(function (settings) {
        this.color = settings.color;
        this.brightness = settings.brightness;
    }.bind(this));
};

MagicHomeAccessory.prototype.setToCurrentColor = function () {
    var color = this.color;
    var brightness = this.brightness;
    if (color.S == 0 && color.H == 0) {
	if(this.purewhite) {
		this.setToWarmWhite();
		return
        } else {
	       	color.L = this.brightness;
		brightness = 100;
        }
    } else {
        color.L = 50;
    }
    var converted = convert.hsl.rgb([color.H, color.S, color.L]);
    var base = '-c '+ Math.round((converted[0] / 100) * brightness) + ',' + Math.round((converted[1] / 100) * brightness) + ',' + Math.round((converted[2] / 100) * brightness);
    this.sendCommand(base);
};

MagicHomeAccessory.prototype.setToWarmWhite = function () {
    var brightness = this.brightness;
    this.sendCommand('-w ' + brightness);
};

// MARK: - POWER STATE
MagicHomeAccessory.prototype.getPowerState = function (callback) {
    this.getState(function (settings) {
        callback(null, settings.on);
    });
};

MagicHomeAccessory.prototype.setPowerState = function (value, callback) {
    this.sendCommand(value ? '--on' : '--off', function () {
        callback();
    });
};

// MARK: - HUE
MagicHomeAccessory.prototype.getHue = function (callback) {
    var color = this.color;
    callback(null, color.H);
};

MagicHomeAccessory.prototype.setHue = function (value, callback) {
    this.color.H = value;
    clearTimeout(this.func);
    this.func = setTimeout(this.setToCurrentColor.bind(this), 1000);
    this.log("HUE: %s", value);
    callback();
};

// MARK: - SATURATION
MagicHomeAccessory.prototype.getSaturation = function (callback) {
    var color = this.color;
    callback(null, color.S);
};

MagicHomeAccessory.prototype.setSaturation = function (value, callback) {
    this.color.S = value;
    clearTimeout(this.func);
    this.func = setTimeout(this.setToCurrentColor.bind(this), 1000);
    this.log("SATURATION: %s", value);
    callback();
};

// MARK: - BRIGHTNESS
 MagicHomeAccessory.prototype.getBrightness = function (callback) {
     this.getState(function (settings) {
         this.brightness = settings.brightness;
         callback(null, settings.brightness);
     }.bind(this));
};

MagicHomeAccessory.prototype.setBrightness = function (value, callback) {
    this.brightness = value;
    clearTimeout(this.func);
    this.func = setTimeout(this.setToCurrentColor.bind(this), 1000);
    this.log("BRIGHTNESS: %s", value);
    callback();
};
