// This code was created by Chris Connelly at Bass Daddy Devices
// Use this to extract Ableton Live workflows from racks

autowatch = 1;
inlets = 1;
outlets = 1;

// n8n Integration Configuration
var N8N_WEBHOOK_URL = "http://localhost:5678/webhook/rack-analysis";

// User input storage
var UserInput = {
    tags: [],
    use_case: "",
    description: "",
    genre: "",
    difficulty: "intermediate"
};

// Workflow extraction types
var WorkflowTypes = {
    device: { container: ["devices"], filterfun: extract_device_workflow },
    chain: { container: ["chains"], filterfun: extract_chain_workflow },
    parameter: { container: ["parameters"] }
};

var Root = "live_set";
var ExtractorAPI = null;
var WorkflowData = null;

// Recursive API management
var TempRecursiveAPI = new Array();
var TempRecursiveAPILevel = 0;

/////////////////////////////////////////
// USER INPUT FUNCTIONS

function set_tags() {
    var tags = Array.prototype.slice.call(arguments);
    UserInput.tags = tags.filter(function (tag) { return tag && tag.length > 0; });
    post("✅ Tags set: " + UserInput.tags.join(", ") + "\n");
}

function set_use_case() {
    var use_case = Array.prototype.slice.call(arguments).join(" ");
    UserInput.use_case = use_case;
    post("✅ Use case set: " + use_case + "\n");
}

function set_description() {
    var description = Array.prototype.slice.call(arguments).join(" ");
    UserInput.description = description;
    post("✅ Description set: " + description + "\n");
}

function set_genre() {
    var genre = Array.prototype.slice.call(arguments).join(" ");
    UserInput.genre = genre;
    post("✅ Genre set: " + genre + "\n");
}

function set_difficulty(level) {
    var validLevels = ["beginner", "intermediate", "advanced", "expert"];
    if (validLevels.indexOf(level) !== -1) {
        UserInput.difficulty = level;
        post("✅ Difficulty set: " + level + "\n");
    } else {
        post("❌ Invalid difficulty. Use: " + validLevels.join(", ") + "\n");
    }
}

function show_user_input() {
    post("=== CURRENT USER INPUT ===\n");
    post("Tags: " + (UserInput.tags.length > 0 ? UserInput.tags.join(", ") : "None") + "\n");
    post("Use Case: " + (UserInput.use_case || "None") + "\n");
    post("Description: " + (UserInput.description || "None") + "\n");
    post("Genre: " + (UserInput.genre || "None") + "\n");
    post("Difficulty: " + UserInput.difficulty + "\n");
    post("=========================\n");
}

function clear_user_input() {
    UserInput = {
        tags: [],
        use_case: "",
        description: "",
        genre: "",
        difficulty: "intermediate"
    };
    post("✅ User input cleared\n");
}

/////////////////////////////////////////
// MAIN WORKFLOW EXTRACTION FUNCTIONS

function extract_workflow_internal(trackID, deviceID) {
    post("=== ENHANCED RACK WORKFLOW EXTRACTOR ===\n");

    // Check if user has provided input
    if (UserInput.tags.length === 0 && !UserInput.use_case) {
        post("⚠️  WARNING: No tags or use case provided!\n");
        post("💡 Set tags: set_tags('drum', 'bus', 'compression')\n");
        post("💡 Set use case: set_use_case('tighten drum bus for punchier drums')\n");
        post("💡 Continue anyway? The AI will still analyze, but user context helps!\n");
    }

    post("Extracting workflow from track " + trackID + ", device " + deviceID + "\n");

    try {
        var devicePath = Root + " tracks " + trackID + " devices " + deviceID;
        post("Target device path: " + devicePath + "\n");

        // Initialize workflow data structure with user input
        WorkflowData = {
            metadata: {
                extracted_at: new Date().toISOString(),
                track_id: trackID,
                device_id: deviceID,
                extractor_version: "2.0"
            },
            user_input: {
                tags: UserInput.tags.slice(), // Copy array
                use_case: UserInput.use_case,
                description: UserInput.description,
                genre: UserInput.genre,
                difficulty: UserInput.difficulty,
                has_user_context: UserInput.tags.length > 0 || UserInput.use_case.length > 0
            },
            workflow: {
                root_device: null,
                devices: [],
                chains: [],
                parameters: [],
                connections: []
            }
        };

        // Create API for target device
        var deviceAPI = new WorkflowAPIMenu(WorkflowTypes.device, devicePath);
        if (!deviceAPI) {
            post("ERROR: Could not access device at " + devicePath + "\n");
            return;
        }

        // Get root device info
        var rootDeviceName = get_safe_name(deviceAPI);
        var deviceType = get_device_type(deviceAPI);
        var deviceClass = unwrap_array(deviceAPI.get("class_name"));
        var visibleMacros = unwrap_array(deviceAPI.get("visible_macro_count"));
        var variationCount = unwrap_array(deviceAPI.get("variation_count"));

        post("Found root device: " + rootDeviceName + " (class: " + deviceClass + ")\n");
        post("Device type: " + deviceType + ", macros: " + visibleMacros + ", variations: " + variationCount + "\n");

        // Clean root device data
        var cleanedRootDevice = {
            name: rootDeviceName,
            path: devicePath,
            type: deviceType,
            class_name: filter_5e324_value(deviceClass),
            visible_macro_count: filter_5e324_value(visibleMacros),
            variation_count: filter_5e324_value(variationCount),
            macros: extract_device_parameters(deviceAPI)
        };

        WorkflowData.workflow.root_device = filter_object_5e324(cleanedRootDevice);

        // Extract chains if device is a rack
        var children = deviceAPI.children;
        if (children && children.join(" ").match(/\s+?chains\s+/)) {
            post("Device has chains - extracting recursive workflow...\n");
            extract_recursive_chains(deviceAPI, devicePath, 0);
        } else {
            post("Device has no chains - simple device workflow\n");
        }

        // Export to knowledge base
        export_to_knowledge_base();

    } catch (error) {
        post("ERROR in extract_workflow: " + error + "\n");
    }
}

// [Keep all existing extraction functions: extract_recursive_chains, extract_chain_devices, extract_device_parameters, etc.]
// [I'll include the core functions but abbreviated for space]

function extract_recursive_chains(api, basePath, depth) {
    try {
        var target = dequote(basePath);
        var spacing = "";
        for (var i = 0; i < depth; i++) {
            spacing += "  ";
        }

        post(spacing + "Extracting chains from: " + target + "\n");

        var chainsAPI = new RecursiveWorkflowAPI(WorkflowTypes.chain, target);
        if (!chainsAPI) return;

        var chainCount = chainsAPI.getcount("chains");
        post(spacing + "Found " + chainCount + " chains\n");

        for (var i = 0; i < chainCount; i++) {
            var chainPath = target + " chains " + i;
            chainsAPI.path = chainPath;

            var chainInfo = {
                chain_id: i,
                path: chainPath,
                depth: depth,
                devices: []
            };

            extract_chain_devices(chainsAPI, chainPath, chainInfo, depth + 1);
            WorkflowData.workflow.chains.push(chainInfo);
        }

        RecursiveWorkflowAPIDispose(chainsAPI);

    } catch (error) {
        post("ERROR in extract_recursive_chains: " + error + "\n");
    }
}

function extract_chain_devices(api, chainPath, chainInfo, depth) {
    try {
        var spacing = "";
        for (var i = 0; i < depth; i++) {
            spacing += "  ";
        }

        api.path = chainPath;
        var deviceCount = api.getcount("devices");
        post(spacing + "Chain has " + deviceCount + " devices\n");

        for (var i = 0; i < deviceCount; i++) {
            var devicePath = chainPath + " devices " + i;
            api.path = devicePath;

            var deviceName = get_safe_name(api);
            post(spacing + "- Device " + i + ": " + deviceName + "\n");

            var deviceInfo = {
                device_id: i,
                name: deviceName,
                path: devicePath,
                depth: depth,
                type: get_device_type(api),
                parameters: extract_device_parameters(api)
            };

            deviceInfo = filter_object_5e324(deviceInfo);
            chainInfo.devices.push(deviceInfo);
            WorkflowData.workflow.devices.push(deviceInfo);

            var children = api.children;
            if (children && children.join(" ").match(/\s+?chains\s+/)) {
                post(spacing + "  Nested rack detected - going deeper...\n");
                extract_recursive_chains(api, devicePath, depth + 1);
            }
        }

    } catch (error) {
        post("ERROR in extract_chain_devices: " + error + "\n");
    }
}

function extract_device_parameters(api) {
    try {
        var parameters = [];
        var basePath = api.path;
        var cleanPath = dequote(basePath);
        var paramAPI = new LiveAPI();
        var paramCount = api.getcount("parameters");

        post("    Extracting " + paramCount + " parameters from: " + cleanPath + "\n");

        for (var i = 0; i < paramCount; i++) {
            var paramPath = cleanPath + " parameters " + i;

            try {
                paramAPI.path = paramPath;

                var paramName = unwrap_array(paramAPI.get("name"));
                var paramValue = unwrap_array(paramAPI.get("value"));
                var paramDisplayValue = unwrap_array(paramAPI.get("display_value"));
                var paramDefaultValue = unwrap_array(paramAPI.get("default_value"));
                var paramMin = unwrap_array(paramAPI.get("min"));
                var paramMax = unwrap_array(paramAPI.get("max"));
                var paramQuantized = unwrap_array(paramAPI.get("is_quantized"));

                var isCorrupted = is_5e324_value(paramName) ||
                    is_5e324_value(paramValue) ||
                    paramName === null ||
                    paramName === undefined ||
                    paramName === "" ||
                    paramName === "unnamed";

                if (!isCorrupted && paramName) {
                    var paramInfo = {
                        parameter_id: i,
                        name: String(paramName),
                        value: paramValue,
                        display_value: paramDisplayValue,
                        default_value: paramDefaultValue,
                        min: paramMin,
                        max: paramMax,
                        is_quantized: paramQuantized
                    };

                    paramInfo = clean_parameter_5e324(paramInfo);
                    parameters.push(paramInfo);
                    post("      Param " + i + ": " + paramName + " = " + paramValue + " (display: " + paramDisplayValue + ")\n");
                } else {
                    post("      Param " + i + ": skipped (corrupted)\n");
                }
            } catch (paramError) {
                post("      Param " + i + ": error - " + paramError + "\n");
            }
        }

        post("    Successfully extracted " + parameters.length + " valid parameters\n");
        return parameters;
    } catch (error) {
        post("ERROR in extract_device_parameters: " + error + "\n");
        return [];
    }
}

/////////////////////////////////////////
// ENHANCED EXPORT TO KNOWLEDGE BASE

function export_to_knowledge_base() {
    try {
        post("=== SENDING TO AI KNOWLEDGE BASE ===\n");

        var rootName = "unknown";
        if (WorkflowData.workflow.root_device) {
            rootName = WorkflowData.workflow.root_device.name;
            post("Root device: " + rootName + "\n");
        }

        post("Total devices found: " + WorkflowData.workflow.devices.length + "\n");
        post("Total chains found: " + WorkflowData.workflow.chains.length + "\n");
        post("User context provided: " + WorkflowData.user_input.has_user_context + "\n");

        if (UserInput.tags.length > 0) {
            post("User tags: " + UserInput.tags.join(", ") + "\n");
        }
        if (UserInput.use_case) {
            post("Use case: " + UserInput.use_case + "\n");
        }

        // Send to n8n knowledge base
        send_to_knowledge_base(WorkflowData);

    } catch (error) {
        post("ERROR in export_to_knowledge_base: " + error + "\n");
    }
}

function send_to_knowledge_base(workflowData) {
    try {
        post("🚀 SENDING TO KNOWLEDGE BASE SERVER...\n");
        post("URL: " + N8N_WEBHOOK_URL + "\n");

        var jsonString = JSON.stringify(workflowData, null, 2);
        post("Payload size: " + jsonString.length + " characters\n");

        var httpMethod = new XMLHttpRequest();

        httpMethod.onreadystatechange = function () {
            if (httpMethod.readyState === 4) {
                var status = httpMethod.status || 0;
                var responseText = httpMethod.responseText || "";

                post("🔄 HTTP Response received - Status: " + status + "\n");

                if (status === 200) {
                    post("✅ SUCCESS: Data sent to knowledge base\n");

                    try {
                        var response = JSON.parse(responseText);

                        if (response.status === "success") {
                            post("🎉 === KNOWLEDGE BASE ENTRY CREATED ===\n");
                            post("📝 Rack: " + (response.rack_name || "Unknown") + "\n");
                            post("🎯 Use Case: " + (response.analyzed_use_case || "N/A") + "\n");
                            post("🏷️ AI Tags: " + (response.ai_tags ? response.ai_tags.join(", ") : "N/A") + "\n");
                            post("⚡ Complexity: " + (response.complexity_score || "Unknown") + "/100\n");
                            post("🔗 Knowledge Base ID: " + (response.knowledge_base_id || "N/A") + "\n");
                            post("✨ Processed at: " + (response.processed_at || "Unknown") + "\n");

                            if (response.similar_racks && response.similar_racks.length > 0) {
                                post("🔍 Similar racks found: " + response.similar_racks.length + "\n");
                            }
                        } else {
                            post("⚠️ Knowledge base entry created, check n8n for details\n");
                        }
                    } catch (parseError) {
                        post("⚠️ Response received but couldn't parse JSON: " + parseError + "\n");
                    }
                } else {
                    post("❌ ERROR: HTTP " + status + "\n");
                    post("Response: " + responseText + "\n");
                }
            }
        };

        httpMethod.open("POST", N8N_WEBHOOK_URL, true);
        httpMethod.setRequestHeader("Content-Type", "application/json");
        httpMethod.send(jsonString);

    } catch (error) {
        post("ERROR in send_to_knowledge_base: " + error + "\n");
    }
}

/////////////////////////////////////////
// UTILITY FUNCTIONS (keep existing ones)

function unwrap_array(value) {
    if (Array.isArray(value) && value.length === 1) {
        return value[0];
    }
    return value;
}

function clean_parameter_5e324(paramInfo) {
    var cleaned = {};
    for (var key in paramInfo) {
        if (paramInfo.hasOwnProperty(key)) {
            var value = paramInfo[key];
            if (key === "name" || key === "value" || key === "parameter_id") {
                cleaned[key] = value;
            } else if (is_5e324_value(value)) {
                cleaned[key] = null;
            } else {
                cleaned[key] = value;
            }
        }
    }
    return cleaned;
}

function is_5e324_value(value) {
    if (value === null || value === undefined) return false;
    if (value === 5e-324) return true;
    var stringValue = String(value);
    return (stringValue === "5e-324" || stringValue.indexOf("5e-324") !== -1);
}

function filter_5e324_value(value) {
    return is_5e324_value(value) ? null : value;
}

function filter_object_5e324(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var filtered = {};
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var value = obj[key];
            if (is_5e324_value(value)) {
                post("        Filtered out " + key + " (5e-324 corruption)\n");
                continue;
            }
            if (Array.isArray(value)) {
                var filteredArray = [];
                for (var i = 0; i < value.length; i++) {
                    var arrayItem = value[i];
                    if (!is_5e324_value(arrayItem)) {
                        if (typeof arrayItem === 'object') {
                            filteredArray.push(filter_object_5e324(arrayItem));
                        } else {
                            filteredArray.push(arrayItem);
                        }
                    }
                }
                filtered[key] = filteredArray;
            } else if (typeof value === 'object' && value !== null) {
                filtered[key] = filter_object_5e324(value);
            } else {
                filtered[key] = value;
            }
        }
    }
    return filtered;
}

function get_safe_name(api) {
    try {
        var name = api.get("name");
        if (name == "" || name == undefined || !name) {
            name = "unnamed";
        }
        if (Array.isArray(name)) {
            return name.length > 0 ? name[0] : "unnamed";
        }
        return String(name);
    } catch (error) {
        return "unnamed";
    }
}

function get_device_type(api) {
    try {
        var children = api.children;
        if (children && children.join(" ").match(/\s+?chains\s+/)) {
            return "rack";
        }
        return "device";
    } catch (error) {
        return "unknown";
    }
}

function dequote(string) {
    return string.replace(/\"/g, "");
}

/////////////////////////////////////////
// RECURSIVE API MANAGEMENT (keep existing)

function RecursiveWorkflowAPI(type, path) {
    var api;
    if (TempRecursiveAPILevel < TempRecursiveAPI.length) {
        api = TempRecursiveAPI[TempRecursiveAPILevel];
    } else {
        api = new LiveAPI();
        TempRecursiveAPI[TempRecursiveAPILevel] = api;
    }
    TempRecursiveAPILevel++;

    if (api) {
        var id = /^id (\d+)$/.exec(path);
        if (id) {
            api.id = parseInt(id[1]);
        } else {
            api.path = path;
        }
        api.wtype = type;
    }
    return api;
}

function RecursiveWorkflowAPIDispose(api) {
    if (TempRecursiveAPILevel <= 0) return;
    if (TempRecursiveAPI[TempRecursiveAPILevel - 1] == api) {
        api.id = 0;
        api.wtype = null;
        TempRecursiveAPILevel--;
    }
}

function WorkflowAPIMenu(type, path) {
    var api = new LiveAPI();
    if (api) {
        var id = /^id (\d+)$/.exec(path);
        if (id) {
            api.id = parseInt(id[1]);
        } else {
            api.path = path;
        }
        api.wtype = type;
    }
    return api;
}

function extract_device_workflow(api) {
    return true;
}

function extract_chain_workflow(api) {
    return true;
}

/////////////////////////////////////////
// ENHANCED USER INTERFACE

function extract_with_context(trackID, deviceID) {
    if (arguments.length < 2) {
        post("Usage: extract_with_context <trackID> <deviceID>\n");
        post("Make sure to set user context first!\n");
        return;
    }
    extract_workflow_internal(trackID, deviceID);
}

function quick_extract(trackID, deviceID, use_case_string) {
    // Quick extraction with inline use case
    if (arguments.length < 3) {
        post("Usage: quick_extract <trackID> <deviceID> <use_case>\n");
        post("Example: quick_extract 1 0 'tighten drum bus for punchier drums'\n");
        return;
    }

    var use_case = Array.prototype.slice.call(arguments, 2).join(" ");
    set_use_case(use_case);
    extract_workflow_internal(trackID, deviceID);
}

// Main extraction functions
function extract_ezfreqsplit_full() {
    // Example with full context
    set_tags("eq", "multiband", "frequency", "splitting");
    set_use_case("split frequency bands for independent processing on drum bus");
    set_genre("electronic");
    set_difficulty("intermediate");
    extract_workflow_internal(1, 0);
}

function extract_metal_head_full() {
    // Example with full context
    set_tags("distortion", "heavy", "guitar", "metal");
    set_use_case("add aggressive distortion to lead synths for industrial sound");
    set_genre("industrial");
    set_difficulty("beginner");
    extract_workflow_internal(1, 0);
}

// Help function
function help() {
    post("🎵 === ENHANCED RACK EXTRACTOR HELP ===\n");
    post("\n📝 USER INPUT COMMANDS:\n");
    post("  set_tags('tag1', 'tag2', 'tag3') - Set searchable tags\n");
    post("  set_use_case('description of when to use this rack')\n");
    post("  set_description('detailed description of what this rack does')\n");
    post("  set_genre('house', 'techno', 'ambient', etc.)\n");
    post("  set_difficulty('beginner', 'intermediate', 'advanced', 'expert')\n");
    post("  show_user_input() - Display current user input\n");
    post("  clear_user_input() - Clear all user input\n");
    post("\n🚀 EXTRACTION COMMANDS:\n");
    post("  extract_with_context(trackID, deviceID) - Extract with user context\n");
    post("  quick_extract(trackID, deviceID, 'use case') - Quick extract with use case\n");
    post("  extract_ezfreqsplit_full() - Extract EZFREQSPLIT with example context\n");
    post("  extract_metal_head_full() - Extract Metal Head with example context\n");
    post("\n💡 EXAMPLE WORKFLOW:\n");
    post("  1. set_tags('compression', 'drum', 'bus', 'glue')\n");
    post("  2. set_use_case('glue drum elements together for tighter sound')\n");
    post("  3. set_genre('house')\n");
    post("  4. extract_with_context(1, 0)\n");
    post("\n🔍 FUTURE SEARCHES:\n");
    post("  Users can now search: 'How do I make tighter drums?'\n");
    post("  And find your exact rack with context!\n");
}

// Initialize on load
function loadbang() {
    post("🎵 Enhanced Rack Extractor v2.0 with Knowledge Base loaded\n");
    post("Server: " + N8N_WEBHOOK_URL + "\n");
    help();
}