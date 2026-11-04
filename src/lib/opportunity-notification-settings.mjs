/** Side-effect-free configuration shared by the supervisor and saved-search worker.
 * @param {Record<string, string | undefined>} environment
 */
export function getOpportunityNotificationSettings(environment = process.env) {
  const enabled = environment.OPPORTUNITY_NOTIFICATIONS_ENABLED ?? 'true';
  if (!['true', 'false'].includes(enabled)) {
    throw new Error('OPPORTUNITY_NOTIFICATIONS_ENABLED must be true or false.');
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
    enabled: enabled === 'true',
    intervalMs: integer('OPPORTUNITY_NOTIFICATIONS_INTERVAL_MS', 60_000, 1000, 86_400_000),
    batchSize: integer('OPPORTUNITY_NOTIFICATIONS_BATCH_SIZE', 10, 1, 20),
  };
}
