// A resolved SMTP call alone does not establish acceptance by the mail service.
export async function sendOwnerEmail(mailer, message) {
  const receipt = await mailer.sendMail(message);
  if (!Array.isArray(receipt?.accepted) || receipt.accepted.length === 0) {
    throw new Error('Mail service did not accept a recipient.');
  }
  return receipt;
}
