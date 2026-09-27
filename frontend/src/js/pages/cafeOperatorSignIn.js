// =============================================================================
// ZAMORIN CAFE ERP — CAFE OPERATIONS OPERATOR SIGN-IN PAGE
// -----------------------------------------------------------------------------
// Canonical delegate to Café Operations Login 2.0 (Login 2.0 design parity)
// =============================================================================

"use strict";

import {
  renderCafeOperationsLogin2,
  wireCafeOperationsLogin2,
} from "./cafeOperationsLogin2.js";

export function renderCafeOperatorSignIn(options = {}) {
  return renderCafeOperationsLogin2(options);
}

export function wireCafeOperatorSignIn(root, options = {}) {
  return wireCafeOperationsLogin2(root, options);
}

export function resetCafeOperatorSignInUi() {
  // Safe cleanup no-op
}
