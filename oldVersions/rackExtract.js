const Max = require('max-api');
const https = require('https');

// Configuration
const SERVER_URL = 'https://your-server.com/api/racks';
const MAX_DEPTH = 10;

// Note: LiveAPI is not available in Node for Max
// We need to communicate with Max patch to access Live API
Max.post('Node for Max: LiveAPI not available, using Max patch communication');

// State
let currentTrackDevice = null;
let currentRackData = null;
let currentMetadata = null;
let analyzedDevices = new Set();

// Command handlers
Max.addHandler('analyze', async () => {
    try {
        if (!currentTrackDevice) {
            Max.outlet('error', 'No track/device info provided');
            return;
        }

        // Check if we have a full LiveAPI path or need to use auto-discovery
        if (currentTrackDevice.livePath && typeof currentTrackDevice.livePath === 'string') {
            // Use full nested path (advanced users)
            Max.outlet('status', `Analyzing specific nested path: ${currentTrackDevice.livePath}`);
            Max.outlet('v8_request', 'analyze_path', currentTrackDevice.livePath);
            Max.outlet('status', 'Nested path analysis request sent to V8 object');
            Max.post('Using full LiveAPI path: ' + currentTrackDevice.livePath);
        } else if (currentTrackDevice.trackID !== undefined && currentTrackDevice.deviceID !== undefined) {
            // Use auto-discovery workflow scanning (primary mode)
            Max.outlet('status', `🔍 Auto-discovering workflow in Track ${currentTrackDevice.trackID}, Device ${currentTrackDevice.deviceID}`);
            const trackID = currentTrackDevice.trackID;
            const deviceID = currentTrackDevice.deviceID;
            Max.outlet('v8_request', 'analyze_with_discovery', trackID, deviceID);
            Max.outlet('status', 'Workflow discovery request sent to V8 object');
            Max.post('🎯 Scanning rack for complete workflow structure...');
            Max.post('This will map all chains, devices, and settings for workflow replication');
        } else {
            Max.outlet('error', 'Track/Device info must contain either "livePath" or both "trackID" and "deviceID"');
            return;
        }

        Max.post('Waiting for V8 object to return rack analysis data...');
        Max.post('V8 object should have access to LiveAPI constructor');

    } catch (error) {
        Max.outlet('error', `Analysis failed: ${error.message}`);
        Max.post(`Error details: ${error.stack}`);
    }
});

// Handler to receive rack data from Max patch
Max.addHandler('rack_analysis_result', (jsonString) => {
    try {
        const rackData = JSON.parse(jsonString);
        currentRackData = rackData;

        // Add track info
        currentRackData.trackInfo = { ...currentTrackDevice };

        analyzedDevices.clear();
        // Count devices in the received data
        countDevices(currentRackData);

        // Create complete analysis package
        const completeAnalysis = {
            metadata: currentMetadata,
            rackStructure: currentRackData,
            analysisInfo: {
                totalDevices: analyzedDevices.size,
                maxDepth: getMaxDepth(currentRackData),
                timestamp: new Date().toISOString(),
                version: '1.0'
            }
        };

        // Output structured data for viewing
        Max.outlet('rack_data', JSON.stringify(currentRackData));
        Max.outlet('complete_analysis', JSON.stringify(completeAnalysis, null, 2));

        // Pretty print to console for debugging
        Max.post('=== COMPLETE RACK ANALYSIS ===');
        Max.post(`Rack Name: ${currentRackData.name}`);
        Max.post(`Rack Type: ${currentRackData.class_name}`);
        Max.post(`Total Chains: ${currentRackData.chains ? currentRackData.chains.length : 0}`);
        Max.post(`Total Devices Analyzed: ${analyzedDevices.size}`);
        Max.post(`Max Nesting Depth: ${getMaxDepth(currentRackData)}`);

        if (currentMetadata) {
            Max.post('=== METADATA ===');
            Max.post(`Name: ${currentMetadata.name}`);
            Max.post(`Use Case: ${currentMetadata.useCase}`);
            Max.post(`Tags: ${currentMetadata.tags.join(', ')}`);
            Max.post(`Creator: ${currentMetadata.creator}`);
        }

        if (currentRackData.chains) {
            printRackStructure(currentRackData, 0);
        }

        Max.outlet('status', 'Analysis complete - check console for detailed output');

    } catch (error) {
        Max.outlet('error', `Failed to process rack analysis result: ${error.message}`);
        Max.post(`Error details: ${error.stack}`);
    }
});

Max.addHandler('trackDevice', (jsonString) => {
    try {
        currentTrackDevice = JSON.parse(jsonString);
        Max.outlet('status', 'Track/Device info received');
    } catch (error) {
        Max.outlet('error', 'Invalid track/device JSON');
    }
});

Max.addHandler('metadata', (jsonString) => {
    try {
        currentMetadata = JSON.parse(jsonString);
        Max.outlet('status', 'Metadata received');
    } catch (error) {
        Max.outlet('error', 'Invalid metadata JSON');
    }
});

// Handle dictionary objects from Max
Max.addHandler('dict', (dictInput) => {
    try {
        Max.post(`Attempting to access dictionary: ${dictInput}`);
        Max.post(`Dictionary input type: ${typeof dictInput}`);

        let dictData;
        let dictName;

        // Check if dictInput is already the dictionary data (object)
        if (typeof dictInput === 'object' && dictInput !== null) {
            dictData = dictInput;
            dictName = 'direct_object';
            Max.post(`Received dictionary object directly: ${JSON.stringify(dictData)}`);
        } else if (typeof dictInput === 'string') {
            // It's a dictionary name, try to get the data
            dictName = dictInput;
            try {
                dictData = Max.getDict(dictName);
                Max.post(`Dict data retrieved from name '${dictName}': ${JSON.stringify(dictData)}`);
            } catch (getError) {
                Max.post(`Failed to get dict data: ${getError.message}`);
                return;
            }
        } else {
            Max.outlet('error', `Invalid dictionary input: ${dictInput}`);
            return;
        }

        if (!dictData || Object.keys(dictData).length === 0) {
            Max.outlet('error', `Dictionary appears to be empty or null`);
            Max.post(`Dictionary name: ${dictName}`);
            Max.post(`Dictionary type: ${typeof dictData}`);
            Max.post(`Dictionary content: ${JSON.stringify(dictData)}`);
            Max.post(`Dictionary keys count: ${Object.keys(dictData || {}).length}`);

            // Still try to set default values if we know the type from the name
            if (typeof dictName === 'string' && dictName.toLowerCase().includes('metadata')) {
                Max.post(`Setting empty metadata defaults for: ${dictName}`);
                currentMetadata = {
                    name: 'Unknown',
                    useCase: 'General',
                    tags: [],
                    creator: 'Anonymous'
                };
                Max.outlet('status', `Empty metadata dictionary processed: ${dictName}`);
            } else if (typeof dictName === 'string' && dictName.toLowerCase().includes('trackdevice')) {
                Max.post(`Empty trackDevice dictionary detected: ${dictName}`);
                Max.outlet('error', `TrackDevice dictionary is empty - please populate it first`);
                return;
            }
            return;
        }

        // Check dictionary content patterns (instead of name patterns when we have direct object)
        if ((typeof dictName === 'string' && dictName.toLowerCase().includes('metadata')) ||
            (dictData && (dictData.rackName || dictData.name || dictData.useCase))) {
            currentMetadata = {
                name: dictData.rackName || dictData.name || 'Unknown',
                useCase: dictData.useCase || 'General',
                tags: dictData.tags || [],
                creator: dictData.creator || 'Anonymous'
            };
            Max.outlet('status', `Metadata received from dictionary`);
            Max.post(`Metadata set: ${JSON.stringify(currentMetadata)}`);
        } else if ((typeof dictName === 'string' && dictName.toLowerCase().includes('trackdevice')) ||
            (dictData && (dictData.trackID !== undefined || dictData.deviceID !== undefined || dictData.livePath !== undefined))) {
            currentTrackDevice = dictData;

            if (dictData.livePath) {
                Max.outlet('status', `Track/Device info with nested path received from dictionary`);
                Max.post(`Track device set with path: ${dictData.livePath}`);
            } else {
                Max.outlet('status', `Track/Device info received from dictionary`);
                Max.post(`Track device set: ${JSON.stringify(currentTrackDevice)}`);
            }
        } else {
            Max.post(`Dictionary didn't match expected patterns`);
            Max.post(`Available data: ${JSON.stringify(dictData)}`);
            Max.post(`Available keys: ${Object.keys(dictData || {}).join(', ')}`);
        }

    } catch (error) {
        Max.outlet('error', `Dictionary access failed: ${error.message}`);
        Max.post(`Stack trace: ${error.stack}`);
    }
});

// Handle messages coming into inlets (this is key for Node for Max!)
Max.addHandler(Max.MESSAGE_TYPES.ALL, (handled, ...args) => {
    if (handled) return;

    // First argument might be a dictionary name
    const firstArg = args[0];

    Max.post(`Received inlet message: ${args.join(' ')}`);

    // Check if it's a dictionary name
    if (typeof firstArg === 'string' && args.length === 1) {
        try {
            const dictData = Max.getDict(firstArg);
            if (dictData) {
                Max.post(`Processing dictionary from inlet: ${firstArg}`);
                Max.post(`Dict data from inlet: ${JSON.stringify(dictData)}`);

                // Check dictionary name patterns
                if (firstArg.toLowerCase().includes('metadata') ||
                    (dictData && (dictData.rackName || dictData.name || dictData.useCase))) {
                    currentMetadata = {
                        name: dictData.rackName || dictData.name || 'Unknown',
                        useCase: dictData.useCase || 'General',
                        tags: dictData.tags || [],
                        creator: dictData.creator || 'Anonymous'
                    };
                    Max.outlet('status', `Metadata received from inlet: ${firstArg}`);
                    Max.post(`Metadata set from inlet: ${JSON.stringify(currentMetadata)}`);
                } else if (firstArg.toLowerCase().includes('trackdevice') ||
                    (dictData && (dictData.trackID !== undefined || dictData.deviceID !== undefined || dictData.livePath !== undefined))) {
                    currentTrackDevice = dictData;

                    if (dictData.livePath) {
                        Max.outlet('status', `Track/Device info with nested path received from inlet: ${firstArg}`);
                        Max.post(`Track device set from inlet with path: ${dictData.livePath}`);
                    } else {
                        Max.outlet('status', `Track/Device info received from inlet: ${firstArg}`);
                        Max.post(`Track device set from inlet: ${JSON.stringify(currentTrackDevice)}`);
                    }
                } else {
                    Max.post(`Dictionary '${firstArg}' from inlet didn't match expected patterns`);
                    Max.post(`Available data: ${JSON.stringify(dictData)}`);
                    Max.post(`Available keys: ${Object.keys(dictData || {}).join(', ')}`);
                }

                return; // Successfully processed as dictionary
            }
        } catch (e) {
            Max.post(`Not a dictionary or error accessing: ${e.message}`);
            // Not a dictionary, continue processing
        }
    }

    // Try parsing as JSON
    const jsonString = args.join(' ');
    try {
        const data = JSON.parse(jsonString);

        // Detect type by content
        if (data.trackID !== undefined && data.deviceID !== undefined) {
            currentTrackDevice = data;
            Max.outlet('status', 'Track/Device info received');
        } else if (data.rackName !== undefined && data.tags !== undefined) {
            // Map rackName to name for consistency
            currentMetadata = {
                name: data.rackName,
                useCase: data.useCase,
                tags: data.tags
            };
            Max.outlet('status', 'Metadata received');
        }
    } catch (error) {
        // Not JSON, ignore
    }
});

// Debug handler to check current state
Max.addHandler('debug', () => {
    Max.post('=== Current State ===');
    Max.post(`Current Track Device: ${currentTrackDevice ? JSON.stringify(currentTrackDevice) : 'null'}`);
    Max.post(`Current Metadata: ${currentMetadata ? JSON.stringify(currentMetadata) : 'null'}`);
    Max.post(`Current Rack Data: ${currentRackData ? 'exists' : 'null'}`);
    Max.outlet('status', 'Debug info posted to console');
});

// Check dictionary contents directly
Max.addHandler('checkDict', (dictName) => {
    try {
        Max.post(`=== Checking Dictionary: ${dictName} ===`);
        const dictData = Max.getDict(dictName);
        Max.post(`Dictionary exists: ${dictData !== null && dictData !== undefined}`);
        Max.post(`Dictionary type: ${typeof dictData}`);
        Max.post(`Dictionary content: ${JSON.stringify(dictData)}`);
        Max.post(`Dictionary keys: ${Object.keys(dictData || {}).join(', ')}`);
        Max.post(`Keys count: ${Object.keys(dictData || {}).length}`);

        if (dictData && Object.keys(dictData).length > 0) {
            Object.keys(dictData).forEach(key => {
                Max.post(`  ${key}: ${JSON.stringify(dictData[key])}`);
            });
        }

        Max.outlet('status', `Dict check complete for: ${dictName}`);
    } catch (error) {
        Max.post(`Error checking dictionary ${dictName}: ${error.message}`);
    }
});

Max.addHandler('send', async () => {
    try {
        await sendToServer();
    } catch (error) {
        Max.outlet('error', `Send failed: ${error.message}`);
    }
});

// Handler to test V8 communication
Max.addHandler('test_v8', () => {
    Max.outlet('v8_request', 'test');
    Max.outlet('status', 'Test message sent to V8 object');
});

// Handler to test LiveAPI via V8
Max.addHandler('test_live_api', () => {
    Max.outlet('v8_request', 'test_live_api');
    Max.outlet('status', 'LiveAPI test request sent to V8 object');
});

// Handler to discover correct path format (live_set vs song)
Max.addHandler('discover_paths', () => {
    Max.outlet('v8_request', 'discover_paths');
    Max.outlet('status', 'Path discovery request sent to V8 object');
    Max.post('Testing both "live_set" and "song" path formats...');
});

// Handler to test nested path analysis
Max.addHandler('test_path', (testPath) => {
    if (!testPath) {
        testPath = 'live_set tracks 1 devices 1 chains 0 devices 0';
    }
    Max.outlet('v8_request', 'analyze_path', testPath);
    Max.outlet('status', `Testing nested path: ${testPath}`);
    Max.post(`Testing nested path: ${testPath}`);
});

// Handle responses from V8 object
Max.addHandler('test_response', (message) => {
    Max.post(`✅ V8 Communication Test: ${message}`);
    Max.outlet('status', 'V8 communication successful');
});

Max.addHandler('live_api_test', (result) => {
    Max.post(`✅ LiveAPI Test via V8: ${result}`);
    Max.outlet('status', `LiveAPI test: ${result}`);
});

Max.addHandler('path_discovery_result', (jsonResult) => {
    try {
        const result = JSON.parse(jsonResult);
        Max.post('=== PATH DISCOVERY RESULTS ===');

        if (result.recommended && result.recommended !== 'none') {
            Max.post(`🎯 RECOMMENDED PATH FORMAT: "${result.recommended}"`);
            Max.post(`✅ Use "${result.recommended} tracks X devices Y" for your paths`);
            Max.post(`   Example: "${result.recommended} tracks 0 devices 0"`);

            if (result.live_set_works) {
                Max.post(`   live_set works: ${result.live_set_tracks} tracks`);
            }
            if (result.song_works) {
                Max.post(`   song works: ${result.song_tracks} tracks`);
            }

            Max.outlet('status', `Path discovery complete - use "${result.recommended}" format`);
        } else {
            Max.post('❌ PATH DISCOVERY FAILED');
            Max.post(`   Error: ${result.error || 'Unknown error'}`);
            if (result.live_set_error) {
                Max.post(`   live_set error: ${result.live_set_error}`);
            }
            if (result.song_error) {
                Max.post(`   song error: ${result.song_error}`);
            }
            Max.outlet('error', 'Path discovery failed - check Live connection');
        }
    } catch (parseError) {
        Max.post(`Path discovery result parse error: ${parseError.message}`);
        Max.outlet('error', 'Failed to parse path discovery results');
    }
});

Max.addHandler('analysis_error', (error) => {
    Max.outlet('error', `V8 Analysis Error: ${error}`);
    Max.post(`V8 analysis failed: ${error}`);
});

// Utility function to count devices in received rack data
function countDevices(rackData) {
    if (!rackData) return;

    if (rackData.deviceId) {
        analyzedDevices.add(rackData.deviceId);
    }

    if (rackData.chains) {
        rackData.chains.forEach(chain => {
            if (chain.devices) {
                chain.devices.forEach(device => {
                    if (device.deviceId) {
                        analyzedDevices.add(device.deviceId);
                    }
                    // Recursively count nested devices
                    if (device.chains) {
                        countDevices(device);
                    }
                });
            }
        });
    }
}

// Note: The following functions were removed because LiveAPI is not available in Node for Max:
// - analyzeRack() - replaced with Max patch communication
// - analyzeChain() - replaced with Max patch communication
// 
// The Max patch should handle Live API calls and send structured data back via 'rack_analysis_result'

// Helper functions for data visualization
function getMaxDepth(rackData, currentDepth = 0) {
    let maxDepth = currentDepth;

    if (rackData.chains) {
        rackData.chains.forEach(chain => {
            chain.devices.forEach(device => {
                if (device.chains) {
                    maxDepth = Math.max(maxDepth, getMaxDepth(device, currentDepth + 1));
                }
            });
        });
    }

    return maxDepth;
}

function printRackStructure(rackData, depth = 0) {
    const indent = '  '.repeat(depth);

    Max.post(`${indent}=== ${rackData.name || 'Unnamed Rack'} (${rackData.class_name}) ===`);

    if (rackData.macros && rackData.macros.length > 0) {
        Max.post(`${indent}Macros: ${rackData.macros.map(m => `${m.index}:${m.name}`).join(', ')}`);
    }

    if (rackData.chains) {
        rackData.chains.forEach((chain, chainIndex) => {
            Max.post(`${indent}Chain ${chainIndex}: ${chain.name || 'Unnamed'}`);
            Max.post(`${indent}  Mixer: Vol=${chain.mixer.volume.toFixed(2)}, Pan=${chain.mixer.panning.toFixed(2)}, Mute=${chain.mixer.mute}`);

            chain.devices.forEach((device, deviceIndex) => {
                if (device.chains) {
                    // It's a nested rack
                    Max.post(`${indent}  Device ${deviceIndex}: NESTED RACK`);
                    printRackStructure(device, depth + 2);
                } else {
                    // Regular device
                    Max.post(`${indent}  Device ${deviceIndex}: ${device.name} (${device.class_name})`);
                    if (device.parameters && device.parameters.length > 0) {
                        const importantParams = device.parameters
                            .filter(p => p.value !== p.default)
                            .slice(0, 3); // Show first 3 non-default params

                        if (importantParams.length > 0) {
                            Max.post(`${indent}    Modified params: ${importantParams.map(p => `${p.name}=${p.value.toFixed(2)}`).join(', ')}`);
                        }
                    }
                }
            });
        });
    }
}

// Enhanced data export for training
Max.addHandler('exportForTraining', () => {
    if (!currentRackData || !currentMetadata) {
        Max.outlet('error', 'Missing rack data or metadata - run analysis first');
        return;
    }

    const trainingData = {
        // Metadata for AI training context
        metadata: {
            name: currentMetadata.name,
            useCase: currentMetadata.useCase,
            tags: currentMetadata.tags,
            creator: currentMetadata.creator,
            problem_solving: extractProblemSolvingContext(currentMetadata),
            audio_characteristics: extractAudioCharacteristics(currentMetadata)
        },

        // Structural data for reconstruction
        structure: {
            rack_type: currentRackData.class_name,
            total_chains: currentRackData.chains.length,
            device_count: analyzedDevices.size,
            nesting_depth: getMaxDepth(currentRackData),
            chains: currentRackData.chains.map(chain => ({
                name: chain.name,
                mixer_settings: chain.mixer,
                devices: chain.devices.map(device => ({
                    name: device.name,
                    type: device.class_name,
                    is_nested_rack: !!device.chains,
                    modified_parameters: device.parameters ?
                        device.parameters.filter(p => p.value !== p.default) : []
                }))
            }))
        },

        // Analysis metadata
        analysis: {
            timestamp: new Date().toISOString(),
            analyzer_version: '1.0',
            track_context: currentRackData.trackInfo
        }
    };

    Max.outlet('training_data', JSON.stringify(trainingData, null, 2));
    Max.post('=== TRAINING DATA GENERATED ===');
    Max.post(`Use Case: ${trainingData.metadata.useCase}`);
    Max.post(`Tags: ${trainingData.metadata.tags.join(', ')}`);
    Max.post(`Structure: ${trainingData.structure.device_count} devices in ${trainingData.structure.total_chains} chains`);
    Max.outlet('status', 'Training data exported - ready for AI ingestion');
});

function extractProblemSolvingContext(metadata) {
    // Extract problem-solving keywords from metadata
    const problemKeywords = ['muddy', 'harsh', 'thin', 'boomy', 'fix', 'improve', 'clean', 'warm', 'bright'];
    const useCase = metadata.useCase.toLowerCase();

    return problemKeywords.filter(keyword => useCase.includes(keyword));
}

function extractAudioCharacteristics(metadata) {
    // Extract audio characteristic keywords
    const audioKeywords = ['vocal', 'bass', 'drum', 'lead', 'pad', 'reverb', 'delay', 'compression', 'eq'];
    const combined = `${metadata.useCase} ${metadata.tags.join(' ')}`.toLowerCase();

    return audioKeywords.filter(keyword => combined.includes(keyword));
}

// Get macro mappings (placeholder for now)
function getMacroMappings(api, macroIndex) {
    // TODO: Implementation depends on Live API capabilities
    // This would map macro controls to device parameters
    return [];
}

// Show all extracted data in readable format
Max.addHandler('showData', () => {
    Max.post('\n=== COMPLETE DATA DUMP ===');

    if (currentMetadata) {
        Max.post('METADATA:');
        Max.post(JSON.stringify(currentMetadata, null, 2));
    }

    if (currentTrackDevice) {
        Max.post('\nTRACK/DEVICE INFO:');
        Max.post(JSON.stringify(currentTrackDevice, null, 2));
    }

    if (currentRackData) {
        Max.post('\nRACK STRUCTURE:');
        Max.post(JSON.stringify(currentRackData, null, 2));
    }

    Max.outlet('status', 'All data dumped to console');
});

// Send to server
async function sendToServer() {
    if (!currentRackData) {
        throw new Error('No rack data to send - run analyze first');
    }

    if (!currentMetadata) {
        throw new Error('No metadata provided');
    }

    // Validate metadata
    if (!currentMetadata.name || !currentMetadata.useCase || !currentMetadata.tags) {
        throw new Error('Missing required metadata fields');
    }

    const payload = {
        rack: currentRackData,
        metadata: {
            name: currentMetadata.name,
            useCase: currentMetadata.useCase,
            tags: currentMetadata.tags,
            creator: currentMetadata.creator || 'Anonymous',
            version: '1.0'
        },
        created: new Date().toISOString()
    };

    // Send via https module
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const url = new URL(SERVER_URL);

        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    Max.outlet('success', 'Rack saved successfully');
                    Max.outlet('response', responseData);
                    resolve(responseData);
                } else {
                    reject(new Error(`Server error: ${res.statusCode}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(data);
        req.end();
    });
}

// Handler to provide instruction to Max patch developers
Max.addHandler('help', () => {
    Max.post('=== RACK EXTRACTOR V11 - WORKFLOW DISCOVERY SYSTEM ===');
    Max.post('');
    Max.post('🎯 PURPOSE: Automatically discover and map complete rack workflows for AI training');
    Max.post('🎵 USE CASE: "How do I get tight drums?" → AI shows you the exact workflow to recreate');
    Max.post('');
    Max.post('This system uses both [v8] and [node.script] objects:');
    Max.post('');
    Max.post('Architecture:');
    Max.post('[node.script rackExtract.js] ↔ [v8 rackAnalyzer.js]');
    Max.post('');
    Max.post('Division of Labor:');
    Max.post('• V8 Object: LiveAPI access, workflow discovery, device chain mapping');
    Max.post('• Node Object: Data processing, AI training export, workflow database');
    Max.post('');
    Max.post('Required Max patch setup:');
    Max.post('1. [v8 rackAnalyzer.js] - handles LiveAPI calls');
    Max.post('2. [node.script rackExtract.js] - handles data processing');
    Max.post('3. Connect v8 outlet 0 to node.script inlet');
    Max.post('4. Connect node.script "v8_request" outlet to v8 inlet');
    Max.post('');
    Max.post('Dictionary Formats:');
    Max.post('• Workflow Discovery (PRIMARY): {"trackID": 119, "deviceID": 121}');
    Max.post('  → Script automatically discovers all nested chains and devices');
    Max.post('• Manual Path (ADVANCED): {"livePath": "live_set tracks 1 devices 1 chains 0 devices 0"}');
    Max.post('• Metadata (REQUIRED): {"rackName": "Tight Drums", "useCase": "make drums punchy", "tags": ["drums", "compression", "eq"]}');
    Max.post('');
    Max.post('Workflow Discovery Process:');
    Max.post('1. User: "Analyze Track 119, Device 121" (the main rack)');
    Max.post('2. Script: Auto-discovers ALL nested chains and devices');
    Max.post('3. Output: Complete workflow map with replication instructions');
    Max.post('4. AI Training: Associates workflow with use case metadata');
    Max.post('');
    Max.post('Test commands:');
    Max.post('• test_v8 - Test V8 communication');
    Max.post('• test_live_api - Test LiveAPI access and show track structure');
    Max.post('• analyze - Auto-discover workflow in specified rack');
    Max.post('• exportForTraining - Generate AI training data');
    Max.post('');
    Max.post('New Workflow Features:');
    Max.post('✅ Automatic nested device discovery (unlimited depth)');
    Max.post('✅ Signal flow mapping and device role detection');
    Max.post('✅ Step-by-step replication instructions');
    Max.post('✅ Workflow complexity analysis');
    Max.post('✅ AI training data with use case associations');
    Max.post('✅ "How do I get X sound?" → AI returns complete workflow');
    Max.outlet('status', 'V8+Node workflow discovery system help displayed');
});

// Initialize
Max.post('Send "help" message for setup instructions');
Max.outlet('status', 'Ready - Workflow Discovery System V11');