/**
 * Wire name of the conversation-side automation tool.
 *
 * Imported expert packages already tell the model to call `automation_update`
 * (WorkBuddy's name). The schema behind it is ours; keeping the name is how
 * those documents start working instead of remaining a phantom.
 *
 * Lives alone so `persona/tool-reality.ts` can name it without pulling the
 * host tool module.
 *
 * @module echoflowai-tools/automation-name
 */

/** What the model calls. */
export const AUTOMATION_TOOL_NAME = 'automation_update'
