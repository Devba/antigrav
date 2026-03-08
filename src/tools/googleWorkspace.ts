import { execSync } from 'child_process';
import path from 'path';

const GOG_PATH = path.join(process.cwd(), 'gog');

export const gmailSearchDef = {
    type: 'function',
    function: {
        name: 'gmail_search',
        description: 'Search for emails in Gmail using a query string (standard Gmail search syntax).',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query (e.g., "from:ryanair.com" or "newer_than:7d").',
                },
                max: {
                    type: 'number',
                    description: 'Maximum number of results to return (default 10).',
                    default: 10,
                },
            },
            required: ['query'],
        },
    },
};

export const gmailSendDef = {
    type: 'function',
    function: {
        name: 'gmail_send',
        description: 'Send a plain text email.',
        parameters: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: 'Recipient email address.',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject.',
                },
                body: {
                    type: 'string',
                    description: 'The content of the email.',
                },
            },
            required: ['to', 'subject', 'body'],
        },
    },
};

export const driveSearchDef = {
    type: 'function',
    function: {
        name: 'drive_search',
        description: 'Search for files in Google Drive.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query or filename.',
                },
                max: {
                    type: 'number',
                    description: 'Maximum number of results to return.',
                    default: 10,
                },
            },
            required: ['query'],
        },
    },
};

export const executeGogCommand = (subcommand: string, args: string[]): string => {
    try {
        const command = `${GOG_PATH} ${subcommand} ${args.join(' ')} --json --no-input`;
        console.log(`[GoogleWorkspace] Executing: ${command}`);
        const output = execSync(command, { encoding: 'utf-8' });
        return output;
    } catch (error: any) {
        console.error(`[GoogleWorkspace] Error executing gog: ${error.message}`);
        return `Error: ${error.stderr || error.message}`;
    }
};
