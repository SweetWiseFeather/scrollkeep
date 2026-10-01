const billingStatus = document.querySelector('#billing-status');
const notice = document.querySelector('#billing-notice');
const trialButton = document.querySelector('#trial-start');
const buyButton = document.querySelector('#buy-license');
const activateButton = document.querySelector('#activate-license');
let busy = false;

async function updateBilling() {
  const result = await chrome.runtime.sendMessage({ type: 'GET_BILLING_STATUS' });
  if (!result?.ok) throw new Error(result?.error || '授权检查失败');
  billingStatus.textContent = result.text;
  trialButton.hidden = result.state !== 'not-started';
  if (result.testMode) {
    notice.textContent = '收费测试版：未接入收款，请勿用于商店正式送审。';
    buyButton.disabled = true;
    buyButton.textContent = '收款尚未配置';
  } else {
    notice.textContent = '试用到期后可购买一年使用权；续费方式以支付页面说明为准。';
    buyButton.disabled = false;
  }
  document.dispatchEvent(new Event('billing-changed'));
  return result;
}
trialButton.onclick = async () => {
  if (busy) return;
  busy = true;
  trialButton.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'START_TRIAL' });
    if (!result?.ok) throw new Error(result?.error || '试用启动失败');
    await updateBilling();
  } catch (error) { billingStatus.textContent = error.message; }
  finally { busy = false; trialButton.disabled = false; }
};
activateButton.onclick = async () => {
  if (busy) return;
  busy = true;
  activateButton.disabled = true;
  try {
    const token = document.querySelector('#license-token').value.trim();
    const result = await chrome.runtime.sendMessage({ type: 'ACTIVATE_LICENSE', token });
    if (!result?.ok) throw new Error(result?.error || '激活失败');
    document.querySelector('#license-token').value = '';
    await updateBilling();
  } catch (error) { billingStatus.textContent = error.message; }
  finally { busy = false; activateButton.disabled = false; }
};
buyButton.onclick = () => {
  const url = globalThis.SCROLLKEEP_BILLING_CONFIG.checkoutUrl;
  if (url && !globalThis.SCROLLKEEP_BILLING_CONFIG.testMode) chrome.tabs.create({ url });
};
updateBilling().catch((error) => { billingStatus.textContent = error.message; });
