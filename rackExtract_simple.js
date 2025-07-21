// rackExtract_simple.js - WORKING automation, no bloat
// Configuration - change these URLs for your setup
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsaG9zdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjc2NDA5OTA0LCJleHAiOjE5OTMxODM5MDR9.m2vhH2lbJyH8NzI8sjL5JqUfYUdnLHOIr6JEgq7cPOA";
var POSTGRES_API_URL = "http://localhost:54321/rest/v1/rpc/store_rack";

// Global variables
var WorkflowData = null;
var UserMetadata = {
    use_case: "",
    tags: [],
    description: ""
};

// CORE EXTRACTION - Actually extract rack structure
function extract_workflow_simple(trackID, deviceID) {
    try {
        post("🎯 Extracting track " + trackID + ", device " + deviceID + "\n");

        var api = new LiveAPI();
        api.path = "live_set tracks " + trackID + " devices " + deviceID;

        var deviceName = api.get("name");
        var deviceClass = api.get("class_name");

        post("Found: " + deviceName + " (" + deviceClass + ")\n");

        // Extract the actual rack structure
        var rackData = {
            name: typeof deviceName === 'string' ? deviceName : (Array.isArray(deviceName) ? deviceName[0] : String(deviceName)),
            class: typeof deviceClass === 'string' ? deviceClass : (Array.isArray(deviceClass) ? deviceClass[0] : String(deviceClass)),
            path: "live_set tracks " + trackID + " devices " + deviceID,
            chains: [],
            parameters: []
        };

        // Get chains if this is a rack device
        if (deviceClass && (deviceClass.toString().indexOf("Rack") > -1 || deviceClass.toString().indexOf("Group") > -1)) {
            try {
                var chainCount = api.get("chains");
                if (chainCount && chainCount.length > 0) {
                    post("📦 Found " + chainCount.length + " chains\n");

                    for (var c = 0; c < chainCount.length; c++) {
                        var chainApi = new LiveAPI();
                        chainApi.path = api.path + " chains " + c;

                        var chainName = chainApi.get("name");
                        var chainDevices = [];

                        // Get devices in this chain
                        try {
                            var deviceIds = chainApi.get("devices");
                            if (deviceIds && deviceIds.length > 0) {
                                for (var d = 0; d < deviceIds.length; d++) {
                                    var deviceApi = new LiveAPI();
                                    deviceApi.path = chainApi.path + " devices " + d;

                                    chainDevices.push({
                                        name: deviceApi.get("name"),
                                        class: deviceApi.get("class_name"),
                                        path: deviceApi.path
                                    });
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
                post("⚠️ No chains found (not a rack device)\n");
            }
        }

        // Get parameters
        try {
            var paramCount = api.get("parameters");
            if (paramCount && paramCount.length > 0) {
                for (var p = 0; p < Math.min(paramCount.length, 20); p++) { // Limit to 20 params
                    var paramApi = new LiveAPI();
                    paramApi.path = api.path + " parameters " + p;

                    rackData.parameters.push({
                        name: paramApi.get("name"),
                        value: paramApi.get("value"),
                        min: paramApi.get("min"),
                        max: paramApi.get("max")
                    });
                }
            }
        } catch (e) {
            // No parameters
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

        post("✅ Extraction complete - " + rackData.chains.length + " chains, " + rackData.parameters.length + " params\n");
        return true;

    } catch (error) {
        post("❌ Extraction failed: " + error + "\n");
        return false;
    }
}

// SIMPLE AUTOMATION - write to file that shell script can use
function send_to_supabase_simple() {
    if (!WorkflowData) {
        post("❌ No data to send\n");
        return;
    }

    try {
        var timestamp = Date.now();
        var filename = "upload_" + timestamp + ".json";

        // Create the shell command
        var payload = JSON.stringify({ workflow_data: WorkflowData });
        var curlCmd = 'curl -X POST -H "Content-Type: application/json" -H "apikey: ' +
            SUPABASE_ANON_KEY + '" -d \'' + payload + '\' ' + POSTGRES_API_URL; post("🚀 AUTOMATION READY:\n");
        post("Command: " + curlCmd + "\n");
        post("🔥 Copy this command and run it in terminal!\n");

        // Also try direct execution if possible
        if (typeof max !== 'undefined') {
            try {
                max.launchurl("terminal:" + curlCmd);
                post("✅ Command launched in terminal!\n");
            } catch (e) {
                // Fallback - just show the command
            }
        }

        return true;

    } catch (error) {
        post("❌ Automation failed: " + error + "\n");
        return false;
    }
}

// COMPLETE WORKFLOW - extract and upload
function extract_and_upload(trackID, deviceID) {
    post("🎯 === SIMPLE AUTOMATED WORKFLOW ===\n");

    // Set metadata if not set
    if (!UserMetadata.use_case) {
        UserMetadata.use_case = "quick_extract";
    }

    // Extract
    if (extract_workflow_simple(trackID, deviceID)) {
        // Upload
        send_to_supabase_simple();
        post("✅ Complete!\n");
    } else {
        post("❌ Failed!\n");
    }
}

// METADATA FUNCTIONS
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

// SIMPLE EXTRACT - just the command you want
function extract(trackID, deviceID) {
    extract_and_upload(trackID, deviceID);
}

// SIMPLE TEST
function test_simple() {
    post("🧪 Testing simple extraction...\n");
    set_use_case("test");
    add_tags("simple", "test");
    extract_and_upload(0, 0);
}

// HELP
function help() {
    post("📚 === SIMPLE RACK EXTRACTOR ===\n");
    post("🚀 Main Function:\n");
    post("  extract(trackID, deviceID) - Extract rack and get upload command\n");
    post("\n📝 Setup:\n");
    post("  set_use_case('mastering') - Set use case\n");
    post("  add_tags('tag1', 'tag2') - Add tags\n");
    post("\n🧪 Test:\n");
    post("  test_simple() - Test with track 0, device 0\n");
    post("\n💡 Example:\n");
    post("  extract(9, 0) - Extract track 9, device 0\n");
    post("  # Then run the curl command shown\n");
}

post("🎵 Simple Rack Extractor loaded - call help() for usage\n");
