const fs = require('fs');
const path = require('path');
const glob = require('glob');

class MultiSRTToELANConverter {
    constructor(options = {}) {
        this.allTimeSlots = new Map();
        this.timeSlotId = 1;
        this.annotationId = 1;
        this.tiers = [];
        this.options = {
            encoding: 'utf8',
            preserveFormatting: false,
            strictValidation: true,
            ...options
        };
    }

    // Enhanced timestamp parsing with validation
    parseTimestamp(timestamp) {
        if (!timestamp || typeof timestamp !== 'string') {
            throw new Error(`Invalid timestamp format: ${timestamp}`);
        }

        // Handle both 2-digit and 3-digit milliseconds
        const timestampRegex = /^(\d{2}):(\d{2}):(\d{2}),(\d{2,3})$/;
        const match = timestamp.trim().match(timestampRegex);
        
        if (!match) {
            throw new Error(`Invalid timestamp format: ${timestamp}`);
        }

        let [, hours, minutes, seconds, milliseconds] = match.map(Number);
        
        // Convert 2-digit milliseconds to 3-digit (pad with 0)
        if (match[4].length === 2) {
            milliseconds *= 10;
        }
        
        // Validate ranges
        if (hours > 23 || minutes > 59 || seconds > 59 || milliseconds > 999) {
            throw new Error(`Invalid timestamp values: ${timestamp}`);
        }

        return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
    }

    // Enhanced SRT parsing with better error handling
    parseSRT(content, filename = 'unknown') {
        if (!content || typeof content !== 'string') {
            throw new Error(`Empty or invalid content in file: ${filename}`);
        }

        const subtitles = [];
        const blocks = content.trim().split(/\n\s*\n/);
        const errors = [];

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            try {
                const lines = block.trim().split('\n');

                if (lines.length < 2) {
                    errors.push(`Block ${i + 1}: insufficient lines (${lines.length})`);
                    continue;
                }

                const index = parseInt(lines[0]);
                if (isNaN(index)) {
                    errors.push(`Block ${i + 1}: invalid subtitle index: "${lines[0]}"`);
                    continue;
                }

                const timeRange = lines[1];
                if (!timeRange.includes(' --> ')) {
                    errors.push(`Block ${i + 1}: invalid time range format: "${timeRange}"`);
                    continue;
                }

                const [startTimeStr, endTimeStr] = timeRange.split(' --> ');
                
                try {
                    const startTime = this.parseTimestamp(startTimeStr.trim());
                    const endTime = this.parseTimestamp(endTimeStr.trim());

                    if (startTime >= endTime) {
                        errors.push(`Block ${i + 1}: invalid time range: start >= end (${startTimeStr} --> ${endTimeStr})`);
                        continue;
                    }

                    let text = '';
                    if (lines.length > 2) {
                        text = lines.slice(2).join('\n');
                        
                        // Handle formatting based on options
                        if (!this.options.preserveFormatting) {
                            text = text.replace(/<[^>]*>/g, ''); // Remove HTML tags
                            text = text.replace(/\{[^}]*\}/g, ''); // Remove ASS/SSA formatting
                        }
                        
                        text = text.trim();
                    }
                    
                    // Keep text as is, even if empty
                    subtitles.push({
                        index,
                        startTime,
                        endTime,
                        text,
                        duration: endTime - startTime
                    });

                } catch (timestampError) {
                    errors.push(`Block ${i + 1}: timestamp error: ${timestampError.message}`);
                    continue;
                }

            } catch (error) {
                errors.push(`Block ${i + 1}: parsing error: ${error.message}`);
            }
        }

        if (errors.length > 0) {
            console.error(`Errors in ${filename}:`);
            errors.forEach(error => console.error(`  ${error}`));
        }

        // Sort subtitles by start time to ensure proper ordering
        subtitles.sort((a, b) => a.startTime - b.startTime);

        return subtitles;
    }

    // Optimized time slot management
    addTimeSlots(subtitles) {
        const uniqueTimes = new Set();
        
        for (const subtitle of subtitles) {
            uniqueTimes.add(subtitle.startTime);
            uniqueTimes.add(subtitle.endTime);
        }

        for (const time of uniqueTimes) {
            if (!this.allTimeSlots.has(time)) {
                this.allTimeSlots.set(time, `ts${this.timeSlotId++}`);
            }
        }
    }

    // Enhanced file processing with better error handling
    processSRTFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const stats = fs.statSync(filePath);
            if (!stats.isFile()) {
                throw new Error(`Path is not a file: ${filePath}`);
            }

            const content = fs.readFileSync(filePath, this.options.encoding);
            const filename = path.basename(filePath);
            const subtitles = this.parseSRT(content, filename);

            if (subtitles.length === 0) {
                return null;
            }

            this.addTimeSlots(subtitles);

            const baseName = path.basename(filePath, '.srt');
            const tierName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');

            // Ensure tier name is unique
            let uniqueTierName = tierName;
            let counter = 1;
            while (this.tiers.some(tier => tier.name === uniqueTierName)) {
                uniqueTierName = `${tierName}_${counter++}`;
            }

            const tier = {
                name: uniqueTierName,
                displayName: baseName,
                subtitles: subtitles,
                sourceFile: filePath,
                totalDuration: Math.max(...subtitles.map(s => s.endTime)) - Math.min(...subtitles.map(s => s.startTime))
            };

            this.tiers.push(tier);
            return tier;

        } catch (error) {
            console.error(`Error processing ${filePath}: ${error.message}`);
            return null;
        }
    }

    // Improved file discovery with better patterns
    findSRTFiles(directory = './input') {
        try {
            if (!fs.existsSync(directory)) {
                throw new Error(`Directory not found: ${directory}`);
            }

            const stats = fs.statSync(directory);
            if (!stats.isDirectory()) {
                throw new Error(`Path is not a directory: ${directory}`);
            }

            const pattern = path.join(directory, '**/*.srt'); // Support subdirectories
            const files = glob.sync(pattern, { nocase: true }); // Case insensitive

            if (files.length === 0) {
                return [];
            }

            return files.sort(); // Sort for consistent processing order

        } catch (error) {
            console.error(`Error finding SRT files: ${error.message}`);
            return [];
        }
    }

    // Enhanced ELAN generation with metadata
    generateELAN(tiers, options = {}) {
        const { mediaFile = null, author = 'Multi-SRT-to-ELAN-Converter' } = options;
        
        const sortedTimeSlots = Array.from(this.allTimeSlots.entries())
            .sort(([timeA], [timeB]) => timeA - timeB);

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += `<ANNOTATION_DOCUMENT AUTHOR="${this.escapeXML(author)}" `;
        xml += `DATE="${new Date().toISOString()}" FORMAT="3.0" VERSION="3.0">\n`;

        // Enhanced header with metadata
        xml += '    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">\n';
        if (mediaFile) {
            const mediaType = this.getMediaType(mediaFile);
            xml += `        <MEDIA_DESCRIPTOR MEDIA_URL="${this.escapeXML(mediaFile)}" `;
            xml += `MIME_TYPE="${mediaType}" RELATIVE_MEDIA_URL="${this.escapeXML(path.basename(mediaFile))}"/>\n`;
        }
        
        // Add metadata about conversion
        xml += '        <PROPERTY NAME="URN">urn:nl-mpi-tools-elan-eaf:srt-converter</PROPERTY>\n';
        xml += `        <PROPERTY NAME="lastUsedAnnotationId">${this.annotationId - 1}</PROPERTY>\n`;
        xml += '    </HEADER>\n';

        // Time order
        xml += '    <TIME_ORDER>\n';
        for (const [time, slotId] of sortedTimeSlots) {
            xml += `        <TIME_SLOT TIME_SLOT_ID="${slotId}" TIME_VALUE="${time}"/>\n`;
        }
        xml += '    </TIME_ORDER>\n';

        // Generate tiers with enhanced metadata
        for (const tier of tiers) {
            xml += `    <TIER LINGUISTIC_TYPE_REF="default-lt" TIER_ID="${tier.name}" `;
            xml += `PARTICIPANT="${this.escapeXML(tier.displayName)}">\n`;

            for (const subtitle of tier.subtitles) {
                const startSlotId = this.allTimeSlots.get(subtitle.startTime);
                const endSlotId = this.allTimeSlots.get(subtitle.endTime);
                const annotationId = `a${this.annotationId++}`;

                xml += `        <ANNOTATION>\n`;
                xml += `            <ALIGNABLE_ANNOTATION ANNOTATION_ID="${annotationId}" `;
                xml += `TIME_SLOT_REF1="${startSlotId}" TIME_SLOT_REF2="${endSlotId}">\n`;
                xml += `                <ANNOTATION_VALUE>${this.escapeXML(subtitle.text)}</ANNOTATION_VALUE>\n`;
                xml += `            </ALIGNABLE_ANNOTATION>\n`;
                xml += `        </ANNOTATION>\n`;
            }

            xml += '    </TIER>\n';
        }

        // Linguistic types
        xml += '    <LINGUISTIC_TYPE GRAPHIC_REFERENCES="false" LINGUISTIC_TYPE_ID="default-lt" ';
        xml += 'TIME_ALIGNABLE="true"/>\n';

        xml += '</ANNOTATION_DOCUMENT>\n';

        return xml;
    }

    // Helper method to determine media type
    getMediaType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const mediaTypes = {
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.mkv': 'video/x-matroska',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4'
        };
        return mediaTypes[ext] || 'video/*';
    }

    // Enhanced XML escaping
    escapeXML(text) {
        if (typeof text !== 'string') {
            return String(text);
        }
        
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters
    }

    // Main conversion method with comprehensive error handling
    async convertMultiple(directory = './input', options = {}) {
        const { outputPath = null, mediaFile = null, author = null } = options;
        
        try {
            // Reset state for new conversion
            this.allTimeSlots.clear();
            this.timeSlotId = 1;
            this.annotationId = 1;
            this.tiers = [];

            const srtFiles = this.findSRTFiles(directory);

            if (srtFiles.length === 0) {
                throw new Error('No SRT files found in the specified directory');
            }

            const validTiers = [];
            const failedFiles = [];

            for (const filePath of srtFiles) {
                const tier = this.processSRTFile(filePath);
                if (tier) {
                    validTiers.push(tier);
                } else {
                    failedFiles.push(filePath);
                }
            }

            if (validTiers.length === 0) {
                throw new Error('No valid SRT files could be processed');
            }

            if (failedFiles.length > 0) {
                console.error(`Warning: ${failedFiles.length} file(s) could not be processed:`);
                failedFiles.forEach(file => console.error(`  ${path.basename(file)}`));
            }

            const elanXML = this.generateELAN(validTiers, { mediaFile, author });

            // Determine output path
            let finalOutputPath = outputPath;
            if (!finalOutputPath) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                finalOutputPath = path.join('./output', `multi-srt-${timestamp}.eaf`);
            }

            // Ensure output directory exists
            const outputDir = path.dirname(finalOutputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            fs.writeFileSync(finalOutputPath, elanXML, 'utf8');

            // Final confirmation message
            const totalAnnotations = validTiers.reduce((sum, tier) => sum + tier.subtitles.length, 0);
            console.log(`Successfully converted ${validTiers.length} SRT file(s) to ${path.basename(finalOutputPath)} with ${totalAnnotations} annotations`);

            return {
                outputPath: finalOutputPath,
                tiersCreated: validTiers.length,
                totalAnnotations,
                failedFiles: failedFiles.length,
                tiers: validTiers.map(t => ({
                    name: t.name,
                    subtitles: t.subtitles.length,
                    duration: t.totalDuration
                }))
            };

        } catch (error) {
            console.error(`Conversion failed: ${error.message}`);
            throw error;
        }
    }

    // Single file conversion with same improvements
    convertSingle(srtFilePath, options = {}) {
        const { outputPath = null, mediaFile = null, author = null } = options;
        
        try {
            // Reset state
            this.allTimeSlots.clear();
            this.timeSlotId = 1;
            this.annotationId = 1;
            this.tiers = [];

            const tier = this.processSRTFile(srtFilePath);
            if (!tier) {
                throw new Error('Failed to process SRT file');
            }

            const elanXML = this.generateELAN([tier], { mediaFile, author });

            let finalOutputPath = outputPath;
            if (!finalOutputPath) {
                const inputDir = path.dirname(srtFilePath);
                const baseName = path.basename(srtFilePath, '.srt');
                finalOutputPath = path.join(inputDir, `${baseName}.eaf`);
            }

            // Ensure output directory exists
            const outputDir = path.dirname(finalOutputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            fs.writeFileSync(finalOutputPath, elanXML, 'utf8');

            console.log(`Successfully converted ${path.basename(srtFilePath)} to ${path.basename(finalOutputPath)} with ${tier.subtitles.length} annotations`);

            return {
                outputPath: finalOutputPath,
                tiersCreated: 1,
                totalAnnotations: tier.subtitles.length
            };

        } catch (error) {
            console.error(`Conversion failed: ${error.message}`);
            throw error;
        }
    }
}

// Enhanced CLI with better argument parsing and validation
function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log('Multi SRT to ELAN Converter v2.0');
        console.log('Converts SRT subtitle files to ELAN annotation format\n');
        console.log('Usage: node srt-to-elan.js [options]\n');
        console.log('Options:');
        console.log('  --dir=PATH          Directory to search for SRT files (default: ./input)');
        console.log('  --output=FILE       Output ELAN file path (default: ./output/auto-generated)');
        console.log('  --media=FILE        Media file reference for ELAN project');
        console.log('  --author=NAME       Author name for ELAN document');
        console.log('  --single=FILE       Convert single SRT file instead of directory');
        console.log('  --encoding=ENC      File encoding (default: utf8)');
        console.log('  --preserve-format   Keep HTML/formatting tags in text');
        console.log('  --strict            Enable strict validation (shows warnings)');
        console.log('  --help, -h          Show this help message\n');
        console.log('Examples:');
        console.log('  node srt-to-elan.js');
        console.log('  node srt-to-elan.js --dir=./subtitles --output=project.eaf');
        console.log('  node srt-to-elan.js --single=movie.srt --media=movie.mp4');
        console.log('  node srt-to-elan.js --author="John Doe" --strict\n');
        return;
    }

    // Parse arguments with validation
    const config = {
        directory: './input',
        outputFile: null,
        mediaFile: null,
        singleFile: null,
        author: null,
        encoding: 'utf8',
        preserveFormatting: false,
        strictValidation: false
    };

    for (const arg of args) {
        if (arg.startsWith('--dir=')) {
            config.directory = arg.substring(6);
        } else if (arg.startsWith('--output=')) {
            config.outputFile = arg.substring(9);
        } else if (arg.startsWith('--media=')) {
            config.mediaFile = arg.substring(8);
        } else if (arg.startsWith('--single=')) {
            config.singleFile = arg.substring(9);
        } else if (arg.startsWith('--author=')) {
            config.author = arg.substring(9);
        } else if (arg.startsWith('--encoding=')) {
            config.encoding = arg.substring(11);
        } else if (arg === '--preserve-format') {
            config.preserveFormatting = true;
        } else if (arg === '--strict') {
            config.strictValidation = true;
        } else {
            console.error(`Unknown argument: ${arg}`);
            process.exit(1);
        }
    }

    // Validate paths
    if (config.singleFile && !fs.existsSync(config.singleFile)) {
        console.error(`File not found: ${config.singleFile}`);
        process.exit(1);
    }

    if (!config.singleFile && !fs.existsSync(config.directory)) {
        console.error(`Directory not found: ${config.directory}`);
        process.exit(1);
    }

    try {
        const converter = new MultiSRTToELANConverter({
            encoding: config.encoding,
            preserveFormatting: config.preserveFormatting,
            strictValidation: config.strictValidation
        });

        if (config.singleFile) {
            converter.convertSingle(config.singleFile, {
                outputPath: config.outputFile,
                mediaFile: config.mediaFile,
                author: config.author
            });
        } else {
            converter.convertMultiple(config.directory, {
                outputPath: config.outputFile,
                mediaFile: config.mediaFile,
                author: config.author
            });
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Dependency check with better error messages
function checkDependencies() {
    try {
        require('glob');
        return true;
    } catch (error) {
        console.error('Required dependency "glob" is not installed.');
        console.error('Please install it using: npm install glob');
        return false;
    }
}

// Run CLI if executed directly
if (require.main === module) {
    if (checkDependencies()) {
        main();
    } else {
        process.exit(1);
    }
}

module.exports = MultiSRTToELANConverter;