/**
 * Feedback dialog, the previous shell's `FeedbackModal` re-homed on the
 * account page.
 *
 * The shape survives the port because the receiving contract did: one dialog
 * for every entry point, content is the only required field, up to 6 images of
 * 10MB each, diagnostics off by default, and a failed submit keeps the draft.
 * The visual language is this shell's — the automation overlay's mask and
 * panel (`AutomationOverlay.tsx`), the account page's quiet rows — not the old
 * shell's Tailwind classes. It layers at 1100 like the sign-in takeover, above
 * the settings overlay's 1000, because it opens from inside that panel.
 *
 * Images travel to the host as base64 bytes rather than paths: the host must
 * not re-open user files by name (`account/feedback.ts` explains the rule).
 */

import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Button, IconCheckOutline14, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountKey } from './locales.ts'
import type { AccountHostCaller } from './types.ts'

/** DOM marker the live checks look for. */
export const FEEDBACK_MODAL_ID = 'openlux-feedback-modal'

const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_CONTENT = 10_000
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
])

const CATEGORIES = ['problem', 'suggestion', 'other'] as const
type Category = (typeof CATEGORIES)[number]

const CATEGORY_KEYS: Record<Category, AccountKey> = {
  problem: 'feedbackCategoryProblem',
  suggestion: 'feedbackCategorySuggestion',
  other: 'feedbackCategoryOther',
}

interface PickedImage {
  readonly name: string
  readonly type: string
  readonly dataBase64: string
  /** object URL for the thumbnail; revoked on removal and on close. */
  readonly previewUrl: string
}

export interface FeedbackModalProps {
  readonly callHost: AccountHostCaller
  readonly t: (key: AccountKey) => string
  readonly onClose: () => void
}

const styles = {
  root: {
    position: 'fixed', inset: 0, zIndex: 1100, display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '24px',
    pointerEvents: 'auto',
  },
  mask: {
    position: 'absolute', inset: 0, border: 0,
    background: 'var(--dsw-alias-bg-mask-1)',
    backdropFilter: 'var(--dsw-mask-blur)', cursor: 'pointer',
  },
  panel: {
    position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column',
    width: 'min(520px, 100%)', maxHeight: '100%',
    minWidth: 0, minHeight: 0, overflow: 'hidden',
    border: '1px solid var(--dsw-alias-border-inverted)', borderRadius: '16px',
    background: 'var(--dsw-alias-bg-layer-2)', boxShadow: 'var(--dsw-shadow-lv3)',
  },
  header: {
    flex: 'none', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: '12px',
    padding: '16px 14px 12px 20px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
  },
  heading: {
    margin: 0, color: 'var(--dsw-alias-label-primary)',
    fontSize: '15px', fontWeight: 600,
  },
  body: {
    display: 'flex', flexDirection: 'column', gap: '14px',
    minHeight: 0, overflow: 'auto', padding: '16px 20px 20px',
  },
  chips: { display: 'flex', gap: '8px' },
  chip: {
    padding: '5px 12px', borderRadius: '999px', cursor: 'pointer',
    border: '1px solid var(--dsw-alias-border-l3)', background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '18px',
  },
  chipActive: {
    borderColor: 'var(--dsw-static-deepseek-500)',
    color: 'var(--dsw-static-deepseek-500)',
    background: 'var(--dsw-alias-interactive-bg-hover)',
  },
  textarea: {
    boxSizing: 'border-box', width: '100%', minHeight: '120px', resize: 'vertical',
    padding: '10px 12px', borderRadius: '10px',
    border: '1px solid var(--dsw-alias-border-l3)',
    background: 'var(--dsw-alias-bg-module-platform)',
    color: 'var(--dsw-alias-label-primary)', fontSize: '13px', lineHeight: 1.6,
    fontFamily: 'inherit', outline: 'none',
  },
  counter: {
    alignSelf: 'flex-end', color: 'var(--dsw-alias-label-tertiary)',
    fontSize: '11px', lineHeight: '16px', marginTop: '-8px',
  },
  imagesRow: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' },
  thumbWrap: {
    position: 'relative', width: '56px', height: '56px', borderRadius: '8px',
    overflow: 'hidden', border: '1px solid var(--dsw-alias-border-l2)',
  },
  thumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbRemove: {
    position: 'absolute', top: '2px', right: '2px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '18px', height: '18px', padding: 0, border: 0, borderRadius: '50%',
    background: 'var(--dsw-alias-bg-mask-1)', color: '#fff', cursor: 'pointer',
  },
  addImage: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '56px', height: '56px', borderRadius: '8px', cursor: 'pointer',
    border: '1px dashed var(--dsw-alias-border-l3)', background: 'transparent',
    color: 'var(--dsw-alias-label-tertiary)', fontSize: '20px', lineHeight: 1,
  },
  hint: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px', lineHeight: '16px' },
  diagnostics: {
    display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer',
    color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '18px',
  },
  error: {
    color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px',
    lineHeight: '18px', minHeight: '18px',
  },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: '8px' },
  success: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
    padding: '28px 20px 8px', textAlign: 'center',
  },
  successBadge: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '40px', height: '40px', borderRadius: '50%',
    background: 'var(--dsw-alias-state-success-tertiary, var(--dsw-alias-interactive-bg-hover))',
    color: 'var(--dsw-alias-state-success-primary, var(--dsw-alias-label-primary))',
  },
  successTitle: {
    margin: 0, color: 'var(--dsw-alias-label-primary)', fontSize: '14px', fontWeight: 600,
  },
  successBody: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' },
} satisfies Record<string, CSSProperties>

function base64Of(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(reader.error?.message ?? 'read failed'))
    reader.onload = () => {
      const url = reader.result as string
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Render the feedback dialog.
 * @param props - see {@link FeedbackModalProps}.
 * @returns the overlay.
 */
export function FeedbackModal({ callHost, t, onClose }: FeedbackModalProps): ReactNode {
  const [category, setCategory] = useState<Category>('problem')
  const [content, setContent] = useState('')
  const [images, setImages] = useState<PickedImage[]>([])
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const close = (): void => {
    for (const image of images) URL.revokeObjectURL(image.previewUrl)
    onClose()
  }

  const addImages = async (files: readonly File[]): Promise<void> => {
    setError('')
    const accepted: PickedImage[] = []
    for (const file of files) {
      if (!IMAGE_TYPES.has(file.type)) {
        setError(t('feedbackImageType'))
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(t('feedbackImageTooLarge'))
        continue
      }
      accepted.push({
        name: file.name === '' ? `image-${Date.now()}.png` : file.name,
        type: file.type,
        dataBase64: await base64Of(file),
        previewUrl: URL.createObjectURL(file),
      })
    }
    setImages(current => {
      const room = MAX_IMAGES - current.length
      if (accepted.length > room) setError(t('feedbackTooManyImages'))
      const taken = accepted.slice(0, Math.max(room, 0))
      for (const extra of accepted.slice(Math.max(room, 0))) URL.revokeObjectURL(extra.previewUrl)
      return [...current, ...taken]
    })
  }

  const submit = async (): Promise<void> => {
    const trimmed = content.trim()
    if (trimmed === '') {
      setError(t('feedbackErrorEmpty'))
      return
    }
    setSubmitting(true)
    setError('')
    const result = await callHost<{ feedbackId: number }>('feedback.submit', {
      category,
      content: trimmed,
      page: 'account',
      includeDiagnostics,
      images: images.map(({ name, type, dataBase64 }) => ({ name, type, dataBase64 })),
    })
    setSubmitting(false)
    // A failed submit keeps the draft: the user's text is worth more than the dialog.
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setSubmitted(true)
  }

  return (
    <div
      style={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label={t('feedback')}
      data-testid={FEEDBACK_MODAL_ID}
    >
      <button
        type="button"
        style={styles.mask}
        aria-label={t('feedbackClose')}
        disabled={submitting}
        onClick={close}
      />
      <section style={styles.panel}>
        <header style={styles.header}>
          <h2 style={styles.heading}>{t('feedback')}</h2>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('feedbackClose')}
            icon={<IconCloseOutline16 size={16} />}
            onClick={close}
          />
        </header>

        {submitted
          ? (
              <div style={styles.body}>
                <div style={styles.success} data-testid="openlux-feedback-success">
                  <span style={styles.successBadge} aria-hidden="true">
                    <IconCheckOutline14 size={18} />
                  </span>
                  <p style={styles.successTitle}>{t('feedbackSuccessTitle')}</p>
                  <p style={styles.successBody}>{t('feedbackSuccessBody')}</p>
                </div>
                <div style={styles.footer}>
                  <Button variant="primary" size="sm" data-testid="openlux-feedback-done" onClick={close}>
                    {t('feedbackDone')}
                  </Button>
                </div>
              </div>
            )
          : (
              <div style={styles.body}>
                <div style={styles.chips} role="radiogroup" aria-label={t('feedback')}>
                  {CATEGORIES.map(value => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={category === value}
                      style={{ ...styles.chip, ...category === value ? styles.chipActive : {} }}
                      data-testid={`openlux-feedback-category-${value}`}
                      onClick={() => setCategory(value)}
                    >
                      {t(CATEGORY_KEYS[value])}
                    </button>
                  ))}
                </div>

                <textarea
                  style={styles.textarea}
                  value={content}
                  maxLength={MAX_CONTENT}
                  placeholder={t('feedbackContentPlaceholder')}
                  data-testid="openlux-feedback-content"
                  onChange={event => setContent(event.target.value)}
                />
                {content.length > MAX_CONTENT - 500 && (
                  <span style={styles.counter}>{content.length} / {MAX_CONTENT}</span>
                )}

                <div style={styles.imagesRow}>
                  {images.map((image, index) => (
                    <span key={image.previewUrl} style={styles.thumbWrap}>
                      <img style={styles.thumb} src={image.previewUrl} alt={image.name} />
                      <button
                        type="button"
                        style={styles.thumbRemove}
                        aria-label={t('feedbackRemoveImage')}
                        title={t('feedbackRemoveImage')}
                        onClick={() => {
                          URL.revokeObjectURL(image.previewUrl)
                          setImages(current => current.filter((_, i) => i !== index))
                        }}
                      >
                        <IconCloseOutline16 size={10} />
                      </button>
                    </span>
                  ))}
                  {images.length < MAX_IMAGES && (
                    <button
                      type="button"
                      style={styles.addImage}
                      aria-label={t('feedbackAddImage')}
                      title={t('feedbackAddImage')}
                      data-testid="openlux-feedback-add-image"
                      onClick={() => inputRef.current?.click()}
                    >
                      +
                    </button>
                  )}
                  <span style={styles.hint}>{t('feedbackImageLimit')}</span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
                    multiple
                    hidden
                    onChange={event => {
                      const files = [...event.target.files ?? []]
                      event.target.value = ''
                      void addImages(files)
                    }}
                  />
                </div>

                <label style={styles.diagnostics}>
                  <input
                    type="checkbox"
                    checked={includeDiagnostics}
                    data-testid="openlux-feedback-diagnostics"
                    onChange={event => setIncludeDiagnostics(event.target.checked)}
                  />
                  {t('feedbackDiagnostics')}
                </label>

                <div style={styles.error} role="alert" data-testid="openlux-feedback-error">{error}</div>

                <div style={styles.footer}>
                  <Button variant="outline" size="sm" disabled={submitting} onClick={close}>
                    {t('feedbackClose')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={submitting || content.trim() === ''}
                    data-testid="openlux-feedback-submit"
                    onClick={() => { void submit() }}
                  >
                    {submitting ? t('feedbackSubmitting') : t('feedbackSubmit')}
                  </Button>
                </div>
              </div>
            )}
      </section>
    </div>
  )
}
