/**
 * `settingsNamespace` across dsh-settings versions.
 *
 * The published `@deepseek-ai/dsh-settings` (0.2.1-rc.2) does not export
 * the `settingsNamespace` function, and importing it there is a hard error
 * at load time:
 *
 *   SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not
 *   provide an export named 'settingsNamespace'
 *
 * The function is a type brand with no runtime behaviour — it checks the
 * namespace against /^[a-z][a-z0-9-]*$/ and returns the string unchanged.
 * Both dsh-settings versions support namespaces themselves, and both export
 * the `SettingsNamespace` *type*; only the newer one exports the helper. So
 * this module keeps the type from the package and provides the function
 * locally, and the plugin loads on either runtime.
 *
 * @module echoflowai-tools/dsh-compat/settings-namespace
 */

import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'

export type { SettingsNamespace }

/** Namespace shape both dsh-settings versions accept. */
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * Brand a raw string as a settings namespace.
 *
 * @param value - candidate namespace; lowercase kebab-case, as in plugin short names.
 * @returns the branded namespace.
 * @throws When the value is not a valid namespace, as the newer package does.
 */
export function settingsNamespace(value: string): SettingsNamespace {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`)
  }
  return value as SettingsNamespace
}
