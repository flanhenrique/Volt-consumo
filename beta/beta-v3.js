/** Volt Consumo — Beta v3.1 · microinterações e layout. */
import "./startup-runtime.js?v=79";
import "./mercosur-region.js?v=84";
import "./regional-auth.js?v=89";
import "./uruguay-tariff-catalog.js?v=83";
import "./energy-detail.js?v=85";
import "./locality-context.js?v=84";
import "./regional-tariff-resolver.js?v=84";
import "./platform-users.js";
import "./home-cleanup.js?v=81";
import "./regional-home.js?v=86";
import "./regional-cycles.js?v=87";
import "./regional-onboarding.js?v=88";
import "./guided-experience.js";
import "./signup-confirmation.js";
import "./tutorial-ack.js?v=68";
import "./initial-bill-setup.js?v=71";
import "./separate-cycles.js?v=77";
import "./test-account-reset.js?v=73";
import "./test-account-onboarding-prefill.js?v=74";
import "./closed-cycle-report.js?v=91";
const REDUCED_MOTION=window.matchMedia("(prefers-reduced-motion: reduce)"),DARK_SCHEME=window.matchMedia("(prefers-color-scheme: dark)");start();
function start(){attachCycleStyles();syncStatusBarColor();const shell=document.querySelector(".beta-v2-shell");if(!shell)return;measureNavigationHeight(shell);enhanceHeader(shell);enhanceNavigation(shell);enhanceSubmitFeedback();}
function attachCycleStyles(){if(document.querySelector('link[href*="cycle-authority.css"]'))return;const link=document.createElement("link");link.rel="stylesheet";link.href="./cycle-authority.css?v=81";document.head.append(link);}
function syncStatusBarColor(){const apply=()=>{const canvas=getComputedStyle(document.documentElement).getPropertyValue("--lm-canvas").trim();if(!canvas)return;for(const meta of document.querySelectorAll('meta[name="theme-color"]')){meta.removeAttribute("media");meta.setAttribute("content",canvas);}};apply();new MutationObserver(apply).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});DARK_SCHEME.addEventListener("change",apply);}
function measureNavigationHeight(shell){const navigation=shell.querySelector(".bottom-navigation");if(!navigation||typeof ResizeObserver==="undefined")return;const publish=()=>{const height=Math.round(navigation.getBoundingClientRect().height);if(height>0)document.documentElement.style.setProperty("--lm-nav-height",`${height}px`);};new ResizeObserver(publish).observe(navigation);publish();}
function enhanceHeader(shell){const header=shell.querySelector(".beta-header"),content=shell.querySelector("#beta-content");if(!header||!content)return;const sync=()=>{header.dataset.scrolled=String(content.scrollTop>4||window.scrollY>4);};content.addEventListener("scroll",sync,{passive:true});window.addEventListener("scroll",sync,{passive:true});sync();}
function enhanceNavigation(shell){const navigation=shell.querySelector(".bottom-navigation");if(!navigation)return;const indicator=document.createElement("span");indicator.className="nav-indicator";indicator.dataset.ready="false";indicator.setAttribute("aria-hidden","true");navigation.prepend(indicator);const move=()=>{const active=navigation.querySelector("button.active");if(!active)return;const bounds=active.getBoundingClientRect(),reference=navigation.getBoundingClientRect();if(!bounds.width)return;indicator.style.setProperty("--nav-indicator-width",`${bounds.width}px`);indicator.style.setProperty("--nav-indicator-x",`${bounds.left-reference.left}px`);};const release=()=>{move();requestAnimationFrame(()=>{indicator.dataset.ready="true";});};navigation.addEventListener("click",()=>requestAnimationFrame(move));window.addEventListener("resize",move,{passive:true});const dashboard=document.querySelector("#dashboard");if(!dashboard)return release();new MutationObserver(()=>{if(!dashboard.hidden)release();}).observe(dashboard,{attributes:true,attributeFilter:["hidden"]});if(!dashboard.hidden)release();}
function enhanceSubmitFeedback(){document.addEventListener("submit",event=>{const form=event.target;if(!(form instanceof HTMLFormElement)||form.method==="dialog")return;const button=event.submitter;if(!(button instanceof HTMLButtonElement)||button.dataset.loading==="true")return;button.dataset.loading="true";const settle=()=>{delete button.dataset.loading;};window.addEventListener("volt:beta-data",settle,{once:true});window.setTimeout(settle,REDUCED_MOTION.matches?240:700);},true);}
