/** Shared, side-effect-free configuration for the web process and worker launcher.
 * @param {Record<string, string | undefined>} environment
 */
export function getLifecycleSettings(environment = process.env) {
  const enabledValue = environment.PROJECT_LIFECYCLE_ENABLED ?? 'true';
  if (!['true', 'false'].includes(enabledValue)) {
    throw new Error('PROJECT_LIFECYCLE_ENABLED must be true or false.');
  }
  const integer = (name, fallback, minimum, maximum) => {
    const raw = environment[name];
    const value = raw === undefined ? fallback : Number(raw);
    if (raw === '' || !Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${name} is outside the allowed integer range.`);
    }
    return value;
  };
  return {
    enabled: enabledValue === 'true',
    intervalMs: integer('PROJECT_LIFECYCLE_INTERVAL_MS', 60000, 1000, 86400000),
    batchSize: integer('PROJECT_LIFECYCLE_BATCH_SIZE', 50, 1, 50),
  };
}
