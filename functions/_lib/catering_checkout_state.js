// Square Checkout creates DRAFT orders; unpaid OPEN orders are also editable.
// https://developer.squareup.com/docs/checkout-api/manage-checkout
export function editableUnpaidCheckout(order,expectedId) {
 return Boolean(order&&order.id===expectedId&&['DRAFT','OPEN'].includes(order.state)
  &&(order.tenders==null||(Array.isArray(order.tenders)&&order.tenders.length===0)));
}
