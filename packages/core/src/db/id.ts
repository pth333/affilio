import { ulid } from 'ulid';

/** Tiền tố ID theo bảng (mục 10 plan v4). */
export const ID_PREFIX = {
  workspace: 'ws',
  user: 'u',
  product: 'p',
  productImage: 'pimg',
  asset: 'a',
  video: 'vid',
  videoVersion: 'vv',
  script: 'scr',
  scriptVersion: 'sv',
  videoCheck: 'chk',
  review: 'rv',
  reviewNote: 'rn',
  render: 'rnd',
  hookTemplate: 'hk',
  batch: 'b',
  job: 'job',
  aiCall: 'ai',
  publication: 'pub',
  metric: 'ms',
  experiment: 'exp',
  audit: 'aud',
  scene: 's',
} as const;

export type IdKind = keyof typeof ID_PREFIX;

export function newId(kind: IdKind): string {
  return `${ID_PREFIX[kind]}_${ulid()}`;
}
