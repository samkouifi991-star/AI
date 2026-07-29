/* Tasty n Healthy — site interactions (vanilla JS, no dependencies) */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    initHeader();
    initMobileNav();
    initReveal();
    initTestimonials();
    initFaq();
    initMenuFilter();
    initContactForm();
    initNewsletterForm();
    setActiveNav();
    setFooterYear();
  });

  /* Sticky header shadow on scroll */
  function initHeader() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* Mobile nav toggle */
  function initMobileNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".main-nav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      toggle.classList.toggle("is-active", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      document.body.classList.toggle("nav-is-open", isOpen);
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.classList.remove("is-active");
        document.body.classList.remove("nav-is-open");
      });
    });
  }

  /* Scroll-reveal via IntersectionObserver */
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, index) {
          if (entry.isIntersecting) {
            setTimeout(function () {
              entry.target.classList.add("is-visible");
            }, (index % 4) * 90);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach(function (el) { observer.observe(el); });
  }

  /* Testimonial carousel */
  function initTestimonials() {
    var track = document.querySelector(".testimonial-track");
    if (!track) return;

    var slides = Array.prototype.slice.call(track.querySelectorAll(".testimonial-slide"));
    var dotsWrap = document.querySelector(".testimonial-dots");
    if (!slides.length) return;

    var current = 0;
    var timer;

    slides.forEach(function (_, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", "Show testimonial " + (i + 1));
      if (i === 0) dot.classList.add("is-active");
      dot.addEventListener("click", function () {
        show(i);
        restart();
      });
      if (dotsWrap) dotsWrap.appendChild(dot);
    });

    var dots = dotsWrap ? Array.prototype.slice.call(dotsWrap.children) : [];

    function show(index) {
      slides[current].classList.remove("is-active");
      if (dots[current]) dots[current].classList.remove("is-active");
      current = (index + slides.length) % slides.length;
      slides[current].classList.add("is-active");
      if (dots[current]) dots[current].classList.add("is-active");
    }

    function restart() {
      clearInterval(timer);
      timer = setInterval(function () { show(current + 1); }, 6000);
    }

    slides[0].classList.add("is-active");
    restart();
  }

  /* FAQ accordion */
  function initFaq() {
    var items = document.querySelectorAll(".faq-item");
    items.forEach(function (item) {
      var question = item.querySelector(".faq-question");
      var answer = item.querySelector(".faq-answer");
      if (!question || !answer) return;

      question.addEventListener("click", function () {
        var isOpen = item.classList.contains("is-open");

        items.forEach(function (other) {
          other.classList.remove("is-open");
          var otherAnswer = other.querySelector(".faq-answer");
          if (otherAnswer) otherAnswer.style.maxHeight = null;
        });

        if (!isOpen) {
          item.classList.add("is-open");
          answer.style.maxHeight = answer.scrollHeight + "px";
        }
      });
    });
  }

  /* Menu category filter (menu.html) */
  function initMenuFilter() {
    var tabs = document.querySelectorAll(".filter-tabs button");
    var categories = document.querySelectorAll(".menu-category");
    if (!tabs.length || !categories.length) return;

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");

        var target = tab.getAttribute("data-filter");

        categories.forEach(function (cat) {
          if (target === "all" || cat.getAttribute("data-category") === target) {
            cat.style.display = "";
          } else {
            cat.style.display = "none";
          }
        });

        if (target !== "all") {
          var el = document.querySelector('.menu-category[data-category="' + target + '"]');
          if (el) {
            var headerOffset = 100;
            var top = el.getBoundingClientRect().top + window.pageYOffset - headerOffset;
            window.scrollTo({ top: top, behavior: "smooth" });
          }
        }
      });
    });
  }

  /* Contact form — client-side validation + friendly status message.
     NOTE: this does not send email on its own. Wire the `action`/fetch
     target to a form backend (Formspree, Netlify Forms, a serverless
     function, etc.) before going live. See README for options. */
  function initContactForm() {
    var form = document.querySelector("#contact-form");
    if (!form) return;

    var status = form.querySelector(".form-status");

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var required = form.querySelectorAll("[required]");
      var valid = true;
      required.forEach(function (field) {
        if (!field.value.trim()) valid = false;
      });

      var email = form.querySelector('[type="email"]');
      if (email && email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
        valid = false;
      }

      if (!status) return;

      status.classList.remove("success", "error");
      if (!valid) {
        status.textContent = "Please fill in all required fields with a valid email.";
        status.classList.add("error", "is-visible");
        return;
      }

      status.textContent = "Thanks! Your message is ready to send — connect this form to your email/CRM backend to complete delivery (see README).";
      status.classList.add("success", "is-visible");
      form.reset();
    });
  }

  function initNewsletterForm() {
    var form = document.querySelector("#newsletter-form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.querySelector(".form-note");
      if (note) {
        note.textContent = "Thanks for joining the Rewards list! (Connect this form to an email service to start collecting signups.)";
      }
      form.reset();
    });
  }

  /* Highlight the current page's nav link */
  function setActiveNav() {
    var path = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".main-nav a").forEach(function (link) {
      var href = link.getAttribute("href");
      if (href === path || (path === "" && href === "index.html")) {
        link.classList.add("active");
      }
    });
  }

  function setFooterYear() {
    var el = document.querySelector("#footer-year");
    if (el) el.textContent = new Date().getFullYear();
  }
})();
