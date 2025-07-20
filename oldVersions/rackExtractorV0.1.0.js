const Max = require('max-api');
const https = require('https');

// Configuration
const SERVER_URL = 'https://your-server.com/api/racks';
const MAX_DEPTH = 10;

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

        const path = `live_set tracks ${currentTrackDevice.trackID} devices ${currentTrackDevice.deviceID}`;
        Max.outlet('status', `Analyzing: ${currentTrackDevice.deviceName} on ${currentTrackDevice.trackName}`);

        analyzedDevices.clear();
        currentRackData = await analyzeRack(path, 0);

        // Add track info
        currentRackData.trackInfo = { ...currentTrackDevice };

        Max.outlet('rack_data', JSON.stringify(currentRackData));
        Max.outlet('status', 'Analysis complete');
    } catch (error) {
        Max.outlet('error', `Analysis failed: ${error.message}`);
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
            (dictData && (dictData.trackID !== undefined || dictData.deviceID !== undefined))) {
            currentTrackDevice = dictData;
            Max.outlet('status', `Track/Device info received from dictionary`);
            Max.post(`Track device set: ${JSON.stringify(currentTrackDevice)}`);
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
                    (dictData && (dictData.trackID !== undefined || dictData.deviceID !== undefined))) {
                    currentTrackDevice = dictData;
                    Max.outlet('status', `Track/Device info received from inlet: ${firstArg}`);
                    Max.post(`Track device set from inlet: ${JSON.stringify(currentTrackDevice)}`);
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

Max.addHandler('clear', () => {
    currentTrackDevice = null;
    currentRackData = null;
    currentMetadata = null;
    analyzedDevices.clear();
    Max.outlet('status', 'Data cleared');
});

// Recursive rack analysis
async function analyzeRack(path, depth = 0) {
    if (depth > MAX_DEPTH) {
        return {
            type: 'rack',
            name: 'Max depth reached',
            error: 'Maximum nesting depth exceeded'
        };
    }

    const api = new Max.LiveAPI(path);

    if (!api || api.id === '0') {
        throw new Error('Invalid device path');
    }

    const deviceId = api.id;
    if (analyzedDevices.has(deviceId)) {
        return {
            type: 'rack',
            name: api.get('name'),
            circularReference: true,
            referenceId: deviceId
        };
    }
    analyzedDevices.add(deviceId);

    const rackData = {
        type: api.get('type'),
        name: api.get('name'),
        class_name: api.get('class_name'),
        deviceId,
        depth,
        chains: [],
        macros: [],
        timestamp: new Date().toISOString()
    };

    // Check if it's a rack
    if (api.get('can_have_chains') === 1) {
        const chainsCount = parseInt(api.get('chains'));

        // Analyze each chain
        for (let i = 0; i < chainsCount; i++) {
            const chainPath = `${path} chains ${i}`;
            const chainData = await analyzeChain(chainPath, depth + 1);
            rackData.chains.push(chainData);
        }

        // Get macro mappings
        for (let m = 1; m <= 8; m++) {
            const macroName = api.get(`macro_name ${m}`);
            const mappings = getMacroMappings(api, m);

            if (mappings.length > 0) {
                rackData.macros.push({
                    index: m,
                    name: macroName,
                    mappings
                });
            }
        }
    }

    return rackData;
}

// Analyze chain with nested rack support
async function analyzeChain(chainPath, depth) {
    const api = new Max.LiveAPI(chainPath);

    const chain = {
        name: api.get('name'),
        devices: [],
        mixer: {
            volume: parseFloat(api.get('mixer_device volume value')),
            panning: parseFloat(api.get('mixer_device panning value')),
            mute: api.get('mixer_device activator value') === 0
        }
    };

    const devicesCount = parseInt(api.get('devices'));

    for (let d = 0; d < devicesCount; d++) {
        const devicePath = `${chainPath} devices ${d}`;
        const deviceApi = new Max.LiveAPI(devicePath);

        // Check if device is a rack
        if (deviceApi.get('can_have_chains') === 1) {
            const nestedRack = await analyzeRack(devicePath, depth);
            nestedRack.isNested = true;
            chain.devices.push(nestedRack);
        } else {
            // Regular device
            const device = {
                type: deviceApi.get('type'),
                name: deviceApi.get('name'),
                class_name: deviceApi.get('class_name'),
                parameters: []
            };

            // Get all parameters
            const paramsCount = parseInt(deviceApi.get('parameters'));

            for (let p = 1; p < paramsCount; p++) {
                const paramPath = `${devicePath} parameters ${p}`;
                const paramApi = new Max.LiveAPI(paramPath);

                const param = {
                    name: paramApi.get('name'),
                    value: parseFloat(paramApi.get('value')),
                    min: parseFloat(paramApi.get('min')),
                    max: parseFloat(paramApi.get('max')),
                    default: parseFloat(paramApi.get('default_value'))
                };

                device.parameters.push(param);
            }

            chain.devices.push(device);
        }
    }

    return chain;
}

// Get macro mappings
function getMacroMappings(api, macroIndex) {
    // Implementation depends on Live API capabilities
    // This is a placeholder
    return [];
}

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

// Initialize
Max.post('Rack Analyzer V8 ready');
Max.outlet('status', 'Ready');