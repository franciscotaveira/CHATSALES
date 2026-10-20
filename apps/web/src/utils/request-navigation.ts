// Editors register only while open with unsaved changes. Collect all reviews before leaving.
export const NAVIGATION_REVIEW_EVENT = "chat-sales:review-navigation";
export type NavigationReview = (proceed: () => void) => void;
export function collectNavigationReviews(target:EventTarget=window) {
  const reviews: NavigationReview[] = [];
  target.dispatchEvent(new CustomEvent<NavigationReview[]>(NAVIGATION_REVIEW_EVENT, { detail: reviews }));
  return reviews;
}
export function requestNavigation(action: () => void, reviews=collectNavigationReviews()) {
  let index = 0;
  const next = () => { const review = reviews[index++]; if (review) review(next); else action(); };
  next();
}
