const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgreSQL's SET LOCAL does not support $1-style query parameters -- the
// value has to be interpolated into the SQL string. Since tenant_id and
// user_id ultimately come from a verified JWT (server-issued, never raw
// client input), this is safe *provided* it's validated as a well-formed
// UUID first. This function is that gate -- every call site in
// DatabaseService uses it before building a SET LOCAL statement.
export function assertValidUuid(value: string, fieldName: string): string {
  if (!UUID_REGEX.test(value)) {
    throw new Error(
      `Refusing to use "${fieldName}" as a session variable: "${value}" is not a valid UUID. ` +
        `This should never happen with a properly verified JWT -- treat this as a bug, not user input to sanitize further.`,
    );
  }
  return value;
}
