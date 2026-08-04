/**
 * 产品标注位置更新 - 参见 项目规范文档.md
 */
function updateTooltipPosition() {
  const tooltipIcons = document.querySelectorAll('.tooltip-icon');
  tooltipIcons.forEach(icon => {
    const rect = icon.getBoundingClientRect();
    const top = rect.top;
    icon.parentElement.style.setProperty('--tooltip-top', `${top}px`);
  });
}

document.addEventListener('DOMContentLoaded', updateTooltipPosition);
window.addEventListener('scroll', updateTooltipPosition);
window.addEventListener('resize', updateTooltipPosition);
