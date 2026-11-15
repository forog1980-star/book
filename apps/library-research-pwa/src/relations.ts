export interface BookMartyrRelation {
  bookId: string;
  martyrId: string;
}

/** Returns every recorded relation for a book without changing review status. */
export function linksForBook<T extends BookMartyrRelation>(
  links: readonly T[],
  bookId: string,
): T[] {
  if (!bookId) return [];
  return links.filter((link) => link.bookId === bookId);
}

/** Returns every recorded relation for a martyr without changing review status. */
export function linksForMartyr<T extends BookMartyrRelation>(
  links: readonly T[],
  martyrId: string,
): T[] {
  if (!martyrId) return [];
  return links.filter((link) => link.martyrId === martyrId);
}
