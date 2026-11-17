/*
 Limits shared by the email composer and the API.

 Kept in a dependency-free module so both tsconfigs can include it: the browser
 validates before sending and the server validates again.
*/

/** Maximum number of files attached to one email. */
export const MAX_ATTACHMENTS = 5;

/** Maximum decoded size of a single attachment (1.5 MB). */
export const MAX_ATTACHMENT_BYTES = 1_500_000;

/** Maximum decoded size of all attachments together (3 MB). */
export const MAX_ATTACHMENTS_TOTAL_BYTES = 3_000_000;

/**
 * Recipients per request. Sending one email per HTTP call keeps every Vercel
 * invocation short; the page loops over the roster in chunks of this size.
 */
export const EMAIL_CHUNK_SIZE = 6;

/** Field limits, enforced on both sides. */
export const MAX_EMAIL_SUBJECT = 200;
export const MAX_EMAIL_MESSAGE = 5_000;
