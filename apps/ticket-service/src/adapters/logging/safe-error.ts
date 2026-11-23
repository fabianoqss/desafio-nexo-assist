function readCode(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null && 'code' in value) {
    const { code } = value;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export function describeError(error: unknown): Record<string, string> {
  const errorName =
    error instanceof Error && typeof error.name === 'string' ? error.name : 'UnknownError';
  const cause =
    typeof error === 'object' && error !== null && 'cause' in error ? error.cause : undefined;
  const code = readCode(error) ?? readCode(cause);

  return { errorName, ...(code === undefined ? {} : { databaseErrorCode: code }) };
}
