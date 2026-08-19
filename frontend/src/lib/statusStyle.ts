/** Converte um status oficial (RN39) em um sufixo de classe CSS estável. */
export function statusSlug(status: string): string {
  return status
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
