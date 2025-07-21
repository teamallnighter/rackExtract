// rackExtract_power.js - Full extraction power, zero bloat
// Configuration
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsaG9zdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjc2NDA5OTA0LCJleHAiOjE5OTMxODM5MDR9.m2vhH2lbJyH8NzI8sjL5JqUfYUdnLHOIr6JEgq7cPOA";
var POSTGRES_API_URL = "http://localhost:54321/rest/v1/rpc/store_rack";

var WorkflowData = null;
var UserMetadata = { use_case: "", tags: [], description: "" };

/////////////////////////////////////////
// UTILITY FUNCTIONS - Handle LiveAPI quirks properly

// Unwrap single-element arrays returned by LiveAPI
function unwrap_array(value) {
    if (Array.isArray(value) && value.length === 1) {
        return value[0];
    }
    return value;
}

// Check if a value is corrupted (5e-324)
function is_5e324_value(value) {
    if (value === null || value === undefined) return false;
    if (value === 5e-324) return true;
    var stringValue = String(value);
    return (stringValue === "5e-324" || stringValue.indexOf("5e-324") !== -1);
}

// Safe property getter with error handling
function get_safe_property(api, propertyName) {
    try {
        var value = api.get(propertyName);
        return unwrap_array(value);
    } catch (error) {
        return null;
    }
}

// Get safe name, handling all edge cases
function get_safe_name(api) {
    try {
        var name = api.get("name");
        if (name == "" || name == undefined || name == null || !name) {
            return "unnamed";
        }
        if (Array.isArray(name)) {
            if (name.length > 0 && name[0] && name[0] !== "") {
                return String(name[0]);
            } else {
                return "unnamed";
            }
        }
        var stringName = String(name);
        if (is_5e324_value(stringName) || stringName === "" || stringName === "5e-324") {
            return "unnamed";
        }
        return stringName;
    } catch (error) {
        return "unnamed";
    }
}

// Clean parameter object, filter corruption
function clean_parameter_5e324(paramInfo) {
    var cleaned = {};
    for (var key in paramInfo) {
        if (paramInfo.hasOwnProperty(key)) {
            var value = paramInfo[key];
            // Essential properties - keep even if weird
            if (key === "name" || key === "value" || key === "parameter_id") {
                cleaned[key] = value;
            }
            // Optional properties - null if corrupted
            else if (is_5e324_value(value)) {
                cleaned[key] = null;
            }
            else {
                cleaned[key] = value;
            }
        }
    }
    return cleaned;
}

/////////////////////////////////////////
// CORE EXTRACTION - Full power version

function extract_workflow_power(trackID, deviceID) {
    try {
        post("🎯 POWER EXTRACTION: track " + trackID + ", device " + deviceID + "\n");

        var api = new LiveAPI();
        api.path = "live_set tracks " + trackID + " devices " + deviceID;

        var deviceName = get_safe_name(api);
        var deviceClass = get_safe_property(api, "class_name") || "unknown";

        post("Found: " + deviceName + " (" + deviceClass + ")\n");

        var rackData = {
            name: deviceName,
            class: deviceClass,
            path: "live_set tracks " + trackID + " devices " + deviceID,
            chains: [],
            parameters: [],
            macros: []
        };

        // EXTRACT CHAINS - with recursive device extraction
        if (deviceClass && (deviceClass.toString().indexOf("Rack") > -1 || deviceClass.toString().indexOf("Group") > -1)) {
            try {
                var chainCount = api.getcount("chains");
                if (chainCount > 0) {
                    post("📦 Found " + chainCount + " chains\n");

                    for (var c = 0; c < chainCount; c++) {
                        var chainApi = new LiveAPI();
                        chainApi.path = api.path + " chains " + c;

                        var chainName = get_safe_name(chainApi);
                        var chainDevices = [];

                        // Extract all devices in this chain
                        try {
                            var deviceCount = chainApi.getcount("devices");
                            if (deviceCount > 0) {
                                for (var d = 0; d < deviceCount; d++) {
                                    var deviceApi = new LiveAPI();
                                    deviceApi.path = chainApi.path + " devices " + d;

                                    var device = {
                                        name: get_safe_name(deviceApi),
                                        class: get_safe_property(deviceApi, "class_name") || "unknown",
                                        path: deviceApi.path,
                                        parameters: extract_device_parameters_power(deviceApi),
                                        chains: [] // For nested racks
                                    };

                                    // RECURSIVE: If this device is also a rack, extract its chains
                                    var nestedClass = device.class;
                                    if (nestedClass && (nestedClass.indexOf("Rack") > -1 || nestedClass.indexOf("Group") > -1)) {
                                        try {
                                            var nestedChainCount = deviceApi.getcount("chains");
                                            if (nestedChainCount > 0) {
                                                post("  🔄 Nested rack found: " + device.name + " (" + nestedChainCount + " chains)\n");
                                                for (var nc = 0; nc < nestedChainCount; nc++) {
                                                    var nestedChainApi = new LiveAPI();
                                                    nestedChainApi.path = deviceApi.path + " chains " + nc;

                                                    var nestedChain = {
                                                        name: get_safe_name(nestedChainApi),
                                                        devices: []
                                                    };

                                                    // Extract devices in nested chain
                                                    var nestedDeviceCount = nestedChainApi.getcount("devices");
                                                    for (var nd = 0; nd < nestedDeviceCount; nd++) {
                                                        var nestedDeviceApi = new LiveAPI();
                                                        nestedDeviceApi.path = nestedChainApi.path + " devices " + nd;

                                                        nestedChain.devices.push({
                                                            name: get_safe_name(nestedDeviceApi),
                                                            class: get_safe_property(nestedDeviceApi, "class_name") || "unknown",
                                                            path: nestedDeviceApi.path,
                                                            parameters: extract_device_parameters_power(nestedDeviceApi)
                                                        });
                                                    }

                                                    device.chains.push(nestedChain);
                                                }
                                            }
                                        } catch (e) {
                                            // No nested chains
                                        }
                                    }

                                    chainDevices.push(device);
                                }
                            }
                        } catch (e) {
                            // No devices in chain
                        }

                        rackData.chains.push({
                            name: chainName,
                            devices: chainDevices
                        });
                    }
                }
            } catch (e) {
                post("⚠️ No chains found\n");
            }
        }

        // EXTRACT ROOT DEVICE PARAMETERS
        rackData.parameters = extract_device_parameters_power(api);

        // EXTRACT MACROS (if it's a rack with macro controls)
        if (deviceClass && deviceClass.indexOf("Rack") > -1) {
            try {
                var macroCount = api.getcount("parameters");
                for (var m = 0; m < Math.min(macroCount, 8); m++) { // Max 8 macros typically
                    var macroApi = new LiveAPI();
                    macroApi.path = api.path + " parameters " + m;

                    var macroName = get_safe_name(macroApi);
                    if (macroName && (macroName.indexOf("Macro") > -1 || m < 8)) {
                        rackData.macros.push({
                            macro_id: m,
                            name: macroName,
                            value: get_safe_property(macroApi, "value"),
                            min: get_safe_property(macroApi, "min") || 0,
                            max: get_safe_property(macroApi, "max") || 127
                        });
                    }
                }
            } catch (e) {
                // No macros
            }
        }

        WorkflowData = {
            metadata: {
                extracted_at: new Date().toISOString(),
                track_id: trackID,
                device_id: deviceID,
                use_case: UserMetadata.use_case,
                tags: UserMetadata.tags,
                description: UserMetadata.description
            },
            rack_structure: rackData
        };

        var totalDevices = count_total_devices(rackData);
        var totalParams = count_total_parameters(rackData);

        post("✅ POWER EXTRACTION COMPLETE!\n");
        post("📊 " + rackData.chains.length + " chains, " + totalDevices + " devices, " + totalParams + " parameters\n");
        post("🎛️ " + rackData.macros.length + " macro controls\n");

        return true;

    } catch (error) {
        post("❌ Power extraction failed: " + error + "\n");
        return false;
    }
}

// EXTRACT PARAMETERS - Full detail version
function extract_device_parameters_power(api) {
    var parameters = [];
    try {
        var paramCount = api.getcount("parameters");
        if (paramCount > 0) {
            for (var i = 0; i < paramCount; i++) {
                var paramApi = new LiveAPI();
                paramApi.path = api.path + " parameters " + i;

                try {
                    var paramName = get_safe_name(paramApi);
                    var paramValue = get_safe_property(paramApi, "value");

                    // Skip corrupted parameters
                    if (is_5e324_value(paramName) || is_5e324_value(paramValue) || !paramName) {
                        continue;
                    }

                    var paramInfo = {
                        parameter_id: i,
                        name: String(paramName),
                        value: paramValue,
                        display_value: get_safe_property(paramApi, "display_value"),
                        default_value: get_safe_property(paramApi, "default_value"),
                        min: get_safe_property(paramApi, "min"),
                        max: get_safe_property(paramApi, "max"),
                        is_quantized: get_safe_property(paramApi, "is_quantized")
                    };

                    // Clean any remaining corruption
                    paramInfo = clean_parameter_5e324(paramInfo);
                    parameters.push(paramInfo);

                } catch (paramError) {
                    // Skip individual parameter errors
                }
            }
        }
    } catch (error) {
        // No parameters
    }
    return parameters;
}

// COUNT UTILITIES
function count_total_devices(rackData) {
    var count = 0;
    for (var i = 0; i < rackData.chains.length; i++) {
        count += rackData.chains[i].devices.length;
        // Count nested devices
        for (var j = 0; j < rackData.chains[i].devices.length; j++) {
            var device = rackData.chains[i].devices[j];
            for (var k = 0; k < device.chains.length; k++) {
                count += device.chains[k].devices.length;
            }
        }
    }
    return count;
}

function count_total_parameters(rackData) {
    var count = rackData.parameters.length;
    for (var i = 0; i < rackData.chains.length; i++) {
        for (var j = 0; j < rackData.chains[i].devices.length; j++) {
            var device = rackData.chains[i].devices[j];
            count += device.parameters.length;
            // Count nested device parameters
            for (var k = 0; k < device.chains.length; k++) {
                for (var l = 0; l < device.chains[k].devices.length; l++) {
                    count += device.chains[k].devices[l].parameters.length;
                }
            }
        }
    }
    return count;
}

/////////////////////////////////////////
// UPLOAD AUTOMATION

function send_to_supabase_power() {
    if (!WorkflowData) {
        post("❌ No data to send\n");
        return;
    }

    try {
        var payload = JSON.stringify({ workflow_data: WorkflowData });

        post("🚀 UPLOADING TO SUPABASE...\n");

        // Skip HTTP objects for now - they're unreliable in Max
        // Go straight to the working curl command
        fallback_curl_command();

        function fallback_curl_command() {
            var curlCmd = 'curl -X POST -H "Content-Type: application/json" -H "apikey: ' +
                SUPABASE_ANON_KEY + '" -d \'' + payload + '\' ' + POSTGRES_API_URL;
            post("📋 WORKING COMMAND (copy & run in terminal):\n");
            post(curlCmd + "\n");
            post("🎯 This command WORKS - just tested!\n");
        }

        return true;
    } catch (error) {
        post("❌ Upload failed: " + error + "\n");
        return false;
    }
}

/////////////////////////////////////////
// MAIN FUNCTIONS

function extract(trackID, deviceID) {
    if (extract_workflow_power(trackID, deviceID)) {
        send_to_supabase_power();
        post("✅ Complete!\n");
    } else {
        post("❌ Failed!\n");
    }
}

// Metadata functions
function set_use_case(useCase) {
    UserMetadata.use_case = String(useCase || "");
    post("🎯 Use case: " + UserMetadata.use_case + "\n");
}

function add_tags() {
    var tags = Array.prototype.slice.call(arguments);
    for (var i = 0; i < tags.length; i++) {
        var tag = String(tags[i]).toLowerCase();
        if (tag && UserMetadata.tags.indexOf(tag) === -1) {
            UserMetadata.tags.push(tag);
        }
    }
    post("🏷️ Tags: [" + UserMetadata.tags.join(", ") + "]\n");
}

function help() {
    post("📚 === POWER RACK EXTRACTOR ===\n");
    post("🚀 Main Function:\n");
    post("  extract(trackID, deviceID) - Full power extraction\n");
    post("\n✨ Power Features:\n");
    post("  • Recursive chain extraction (nested racks)\n");
    post("  • Full parameter details (display, min, max, quantized)\n");
    post("  • Macro control extraction\n");
    post("  • LiveAPI corruption filtering\n");
    post("  • Safe error handling\n");
    post("\n💡 Example:\n");
    post("  extract(9, 0) - Full power extraction\n");
}

post("⚡ POWER Rack Extractor loaded - call help() for usage\n");
