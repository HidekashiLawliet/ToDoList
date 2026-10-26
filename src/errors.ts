import { STATUS_CODES } from 'node:http';

// An error that already knows its HTTP status and message
export class HttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export const notFound = () => new HttpError(404, 'not found');

export interface ErrorAnswer {
    status: number;
    message: string;
}

// Node socket errors that mean the database cannot be reached
const NETWORK_CODES = /^(ECONN|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|EPIPE)/;

function isDatabaseDown(error: { fatal?: unknown; errno?: unknown; code?: unknown }): boolean {
    // Fatal: connection lost; errno 45000+ is connector-side
    return error.fatal === true
        || (typeof error.errno === 'number' && error.errno >= 45000)
        || (typeof error.code === 'string' && NETWORK_CODES.test(error.code));
}

// Status and message to send for any error
export function describeError(error: unknown): ErrorAnswer {
    if (error instanceof HttpError) {
        return { status: error.status, message: error.message };
    }
    if (typeof error !== 'object' || error === null) {
        return { status: 500, message: 'internal error' };
    }
    const details = error as { status?: unknown; type?: unknown; fatal?: unknown; errno?: unknown; code?: unknown };
    // Express body parser: bad JSON, body too large
    if (details.type === 'entity.parse.failed') {
        return { status: 400, message: 'request body is not valid JSON' };
    }
    if (details.type === 'entity.too.large') {
        return { status: 413, message: 'request body is too large' };
    }
    if (typeof details.status === 'number' && details.status >= 400 && details.status < 500) {
        return { status: details.status, message: (STATUS_CODES[details.status] ?? 'bad request').toLowerCase() };
    }
    if (isDatabaseDown(details)) {
        return { status: 503, message: 'database unavailable' };
    }
    return { status: 500, message: 'internal error' };
}
