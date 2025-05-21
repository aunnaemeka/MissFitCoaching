document.addEventListener("DOMContentLoaded", () => {
  const faqItems = document.querySelectorAll(".faq__item");

  // Ensure all answers are hidden by default
  faqItems.forEach((item) => {
    const answer = item.querySelector(".faq__answer");
    const plusIcon = item.querySelector(".faq__icon--plus");
    const minusIcon = document.createElement("img");

    // Set minus icon attributes
    minusIcon.src = "../assets/icons/minus.svg";
    minusIcon.alt = "Collapse";
    minusIcon.classList.add("faq__icon", "faq__icon--minus");
    minusIcon.style.display = "none"; // Hide minus icon initially

    // Insert minus icon after the plus icon
    plusIcon.insertAdjacentElement("afterend", minusIcon);

    // Hide answers by default
    answer.style.display = "none";

    // Add click event listener to the entire FAQ item (not just the header)
    item.addEventListener("click", (e) => {
      // Prevent default behavior if the click is on a link or button (optional, adjust as needed)
      if (e.target.tagName === "A" || e.target.tagName === "BUTTON") return;

      const isExpanded = item.classList.toggle("faq__item--expanded");

      // Toggle icon visibility
      plusIcon.style.display = isExpanded ? "none" : "inline-block";
      minusIcon.style.display = isExpanded ? "inline-block" : "none";

      // Toggle the answer visibility
      answer.style.display = isExpanded ? "block" : "none";
    });
  });
});


document.addEventListener('DOMContentLoaded', () => {
  const categories = document.querySelectorAll('.category');
  const dropdownToggle = document.querySelector('.category-dropdown__toggle');
  const dropdownList = document.querySelector('.category-dropdown__list');
  const dropdownItems = document.querySelectorAll('.category-dropdown__item');
  const dropdownText = document.querySelector('.category-dropdown__text');

  // Function to update the active category
  const updateActiveCategory = (value) => {
    categories.forEach(category => {
      if (category.getAttribute('data-value') === value) {
        category.classList.add('active');
      } else {
        category.classList.remove('active');
      }
    });
    dropdownText.textContent = value; // Update dropdown toggle text
    dropdownText.style.color = '#000000'; // Set text color to match active state
  };

  // Handle clicks on horizontal buttons
  categories.forEach(category => {
    category.addEventListener('click', () => {
      const value = category.getAttribute('data-value');
      updateActiveCategory(value);
    });
  });

  // Toggle dropdown visibility
  dropdownToggle.addEventListener('click', (e) => {
    e.preventDefault();
    dropdownList.classList.toggle('active');
    dropdownToggle.classList.toggle('open');
    dropdownToggle.setAttribute('aria-expanded', dropdownToggle.classList.contains('open'));
  });

  // Handle dropdown item selection
  dropdownItems.forEach(item => {
    item.addEventListener('click', () => {
      const value = item.getAttribute('data-value');
      updateActiveCategory(value);
      dropdownList.classList.remove('active');
      dropdownToggle.classList.remove('open');
      dropdownToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdownToggle.contains(e.target) && !dropdownList.contains(e.target)) {
      dropdownList.classList.remove('active');
      dropdownToggle.classList.remove('open');
      dropdownToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Initialize with the current active category
  const initialActive = document.querySelector('.category.active');
  if (initialActive) {
    updateActiveCategory(initialActive.getAttribute('data-value'));
  }
});


document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.querySelector('.header__menu-toggle');
  const mobileMenu = document.querySelector('.header__mobile-menu');
  const mobileDropdownToggles = document.querySelectorAll('.header__mobile-nav-link--dropdown');

  // Toggle mobile menu
  menuToggle.addEventListener('click', () => {
    const isExpanded = mobileMenu.classList.toggle('active');
    menuToggle.setAttribute('aria-expanded', isExpanded);
  });

  // Toggle mobile dropdowns (on click)
  mobileDropdownToggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const dropdown = toggle.nextElementSibling;
      const isExpanded = dropdown.classList.toggle('active');
      
      // Rotate angle icon
      const icon = toggle.querySelector('.header__mobile-nav-icon');
      if (icon) {
        icon.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  });

  // Close mobile menu and dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!mobileMenu.contains(e.target) && !menuToggle.contains(e.target)) {
      mobileMenu.classList.remove('active');
      menuToggle.setAttribute('aria-expanded', 'false');
      
      // Close all mobile dropdowns
      document.querySelectorAll('.header__mobile-nav-dropdown').forEach(dropdown => {
        dropdown.classList.remove('active');
      });
      // Reset mobile angle icons
      document.querySelectorAll('.header__mobile-nav-icon').forEach(icon => {
        // icon.style.transform = 'rotate(0deg)';
      });
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  function initSlider(sliderClass) {
    const slidesContainer = document.querySelector(`.${sliderClass}__slides`);
    const slides = document.querySelectorAll(`.${sliderClass}__slide`);
    const prevArrow = document.querySelector(`.${sliderClass}__arrow--left`);
    const nextArrow = document.querySelector(`.${sliderClass}__arrow--right`);
    const pagination = document.querySelector(`.${sliderClass}__pagination`);
    const totalSlides = slides.length;
    let currentSlide = 1;
    let isTransitioning = false;

    // Clone slides for infinite loop
    const firstSlideClone = slides[0].cloneNode(true);
    const lastSlideClone = slides[totalSlides - 1].cloneNode(true);
    slidesContainer.appendChild(firstSlideClone);
    slidesContainer.insertBefore(lastSlideClone, slides[0]);

    const allSlides = document.querySelectorAll(`.${sliderClass}__slide`);

    function updateSlideWidth() {
      const containerWidth = slidesContainer.parentElement.offsetWidth;
      return containerWidth > 0 ? containerWidth : 700; // Fallback to 700px if width is 0
    }

    let slideWidth = updateSlideWidth();
    slidesContainer.style.transition = 'none';
    slidesContainer.style.transform = `translateX(-${slideWidth}px)`;

    function updateHeight() {
      const activeSlide = slidesContainer.querySelector(`.${sliderClass}__slide:nth-child(${currentSlide + 1})`);
      if (activeSlide) {
          const newHeight = activeSlide.offsetHeight;
          slidesContainer.style.height = `${newHeight}px`;
          slidesContainer.parentElement.style.height = `${newHeight}px`;
      }
  }

    // Show slide function
    function showSlide(index, skipTransition = false) {
      if (isTransitioning && !skipTransition) return;
      isTransitioning = true;

      slideWidth = updateSlideWidth();
      slidesContainer.style.transition = skipTransition ? 'none' : 'transform 0.2s ease';
      slidesContainer.style.transform = `translateX(-${index * slideWidth}px)`;
      currentSlide = index;

      let paginationNumber = ((currentSlide - 1 + totalSlides) % totalSlides) + 1;
      pagination.textContent = `${paginationNumber} / ${totalSlides}`;
      
      updateHeight(); // Adjust height when changing slides

      if (!skipTransition) {
        setTimeout(() => { isTransitioning = false; }, 500);
      } else {
        isTransitioning = false;
      }
    }

    // Handle transition end for looping
    slidesContainer.addEventListener('transitionend', () => {
      if (currentSlide === 0) {
        slidesContainer.style.transition = 'none';
        currentSlide = totalSlides;
        slidesContainer.style.transform = `translateX(-${currentSlide * slideWidth}px)`;
        setTimeout(() => slidesContainer.style.transition = 'transform 0.5s ease', 50);
      } else if (currentSlide === totalSlides + 1) {
        slidesContainer.style.transition = 'none';
        currentSlide = 1;
        slidesContainer.style.transform = `translateX(-${currentSlide * slideWidth}px)`;
        setTimeout(() => slidesContainer.style.transition = 'transform 0.5s ease', 50);
      }
    });


    // Navigation
    prevArrow.addEventListener('click', () => {
      if (!isTransitioning) showSlide(currentSlide - 1);
    });
    nextArrow.addEventListener('click', () => {
      if (!isTransitioning) showSlide(currentSlide + 1);
    });

    

    // Handle resize
    window.addEventListener('resize', () => {
      setTimeout(() => {
        slideWidth = updateSlideWidth();
        showSlide(currentSlide, true); // Update position without transition
      }, 100);
    });

    updateHeight();

    // Start at first slide
    showSlide(1);
  }

  initSlider('testimonial-slider');
  initSlider('testimonial-slider-2');
});


// Footer dropdown functionality
// Footer dropdown functionality
document.addEventListener('DOMContentLoaded', function() {
  // Get all footer headings
  const footerHeadings = document.querySelectorAll('.footer__heading');
  
  // Function to check if we're in mobile view
  function isMobileView() {
    return window.innerWidth <= 723;
  }
  
  // Function to handle click on headings
  function toggleDropdown(event) {
    if (!isMobileView()) return; // Don't do anything if not in mobile view
    
    const heading = event.currentTarget;
    const listContainer = heading.nextElementSibling;
    const upIcon = heading.querySelector('.footer__heading-icon-up');
    const downIcon = heading.querySelector('.footer__heading-icon-down');
    
    // Toggle the active class on the list container
    listContainer.classList.toggle('active');
    
    // Toggle the visibility of the icons
    if (upIcon && downIcon) {
      if (listContainer.classList.contains('active')) {
        upIcon.style.display = 'block';
        downIcon.style.display = 'none';
      } else {
        upIcon.style.display = 'none';
        downIcon.style.display = 'block';
      }
    }
  }
  
  // Add click event listener to all headings
  footerHeadings.forEach(heading => {
    heading.addEventListener('click', toggleDropdown);
  });
  
  // Reset all dropdowns when resizing above mobile breakpoint
  window.addEventListener('resize', function() {
    if (!isMobileView()) {
      document.querySelectorAll('.footer__list-container').forEach(container => {
        container.classList.remove('active');
      });
      
      document.querySelectorAll('.footer__heading-icon-up').forEach(icon => {
        icon.style.display = 'none';
      });
      
      document.querySelectorAll('.footer__heading-icon-down').forEach(icon => {
        icon.style.display = 'block';
      });
    }
  });
});

// Newsletter Form Handling
const newsletterForm = document.getElementById('newsletterForm');

if (newsletterForm) {
  newsletterForm.addEventListener('submit', function (e) {
    e.preventDefault();

    // Disable the submit button to prevent multiple clicks
    const submitButton = newsletterForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const formData = new FormData(newsletterForm);
    const formDataObj = {};
    formData.forEach((value, key) => {
      formDataObj[key] = value;
    });

    fetch(newsletterForm.action, {
      method: 'POST',
      body: JSON.stringify(formDataObj),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
      .then(response => {
        if (response.ok) {
          // Create the replacement confirmation HTML
          const confirmationHTML = `
            <div class="subscription-confirmation">
              <div class="subscription-confirmation__checkmark-circle">
                <img src="../assets/icons/checkmark-large.svg" alt="Checkmark" class="subscription-confirmation__checkmark">
              </div>
              <h1 class="subscription-confirmation__title">CONFIRMED!</h1>
              <p class="subscription-confirmation__text">You have successfully subscribed to our list.</p>
              <p class="subscription-confirmation__text">We'll send you actionable career tips weekly.</p>
            </div>
          `;

          // Replace the entire newsletter container with the confirmation
          const newsletterSection = document.getElementById('newsletter');
          newsletterSection.innerHTML = confirmationHTML;
        } else {
          console.error('Form submission error:', response);
          alert('Something went wrong. Please try again.');
          submitButton.disabled = false; // Re-enable the button on error
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
        submitButton.disabled = false; // Re-enable the button on error
      });
  }, { once: true }); // Ensure the event listener is added only once
}


window.onloadTurnstileCallback = function () {
  turnstile.render('#cf-turnstile-widget', {
    sitekey: '0x4AAAAAABd6NQlYjEqiEjrX',
    callback: function (token) {
      window.turnstileToken = token;
      document.querySelectorAll('.pricing__button').forEach(btn => btn.disabled = false);
    },
    'expired-callback': function () {
      window.turnstileToken = null;
      document.querySelectorAll('.pricing__button').forEach(btn => btn.disabled = true);
    },
    'error-callback': function () {
      console.error('Turnstile error.');
      window.turnstileToken = null;
      document.querySelectorAll('.pricing__button').forEach(btn => btn.disabled = true);
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const stripe = Stripe('pk_live_51R50MCEK0wONGgBdBUqnsuJBmfqqYvg6BgGaKCtgVw2wPExrpbFwT7btRs15dFhHx48lGbEFMStbpZIqZoDSPaZx00jEXXl5zj');
  const buttons = document.querySelectorAll('.pricing__button');

  buttons.forEach(button => {
    button.disabled = true; // Disable all buttons on load

    button.addEventListener('click', async function () {
      if (!window.turnstileToken) {
        alert('Security verification not completed yet. Please wait.');
        return;
      }

      const planName = this.getAttribute('data-plan');
      const price = parseFloat(this.getAttribute('data-price'));

      const originalText = this.textContent;
      this.textContent = 'Processing...';
      this.disabled = true;

      try {
        const response = await fetch('/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planName,
            amount: price,
            paymentType: 'onetime', // adjust if using subscriptions later
            intervalCount: 1,
            returnUrl: window.location.href,
            turnstileToken: window.turnstileToken
          })
        });

        const result = await response.json();

        if (!response.ok) {
          alert('Payment failed: ' + (result.error || 'Unknown error'));
          this.disabled = false;
          this.textContent = originalText;
          return;
        }

        const { sessionId } = result;
        const { error } = await stripe.redirectToCheckout({ sessionId });
        if (error) throw error;

      } catch (err) {
        console.error('Payment error:', err.message);
        alert('An error occurred. Please try again.');
        this.textContent = originalText;
        this.disabled = false;
      }
    });
  });
});



