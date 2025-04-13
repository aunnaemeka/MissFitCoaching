// Turnstile and form handling code
// Load Turnstile script only once
document.addEventListener('DOMContentLoaded', function () {
    const turnstileScript = document.createElement('script');
    turnstileScript.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    turnstileScript.async = true;
    turnstileScript.defer = true;
    document.head.appendChild(turnstileScript);
  });
  
  // Callback for contact form Turnstile
  function onContactTurnstileSuccess(token) {
    document.getElementById('_turnstile-contact').value = token;
  }
  
  // Callback for newsletter form Turnstile
  function onNewsletterTurnstileSuccess(token) {
    document.getElementById('_turnstile-newsletter').value = token;
  }
  
  // Handle form submissions
  document.addEventListener('DOMContentLoaded', function () {
    // Contact form submission
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
      contactForm.addEventListener('submit', async function (e) {
        e.preventDefault();
  
        const token = document.getElementById('_turnstile-contact').value;
        if (!token) {
          alert('Please complete the CAPTCHA verification');
          return;
        }
  
        const formData = new FormData(contactForm);
  
        try {
          const response = await fetch(contactForm.action, {
            method: 'POST',
            body: formData,
          });
  
          if (response.ok) {
            document.getElementById('contactFormContainer').style.display = 'none';
            document.getElementById('contact-confirmation').style.display = 'block';
          } else {
            throw new Error(`Server responded with status ${response.status}`);
          }
        } catch (error) {
          console.error('Contact form submission error:', error);
          alert('Failed to submit the form. Please try again later.');
        }
      });
    }
  
    // Newsletter form submission
    const newsletterForm = document.getElementById('newsletterForm');
    if (newsletterForm) {
      newsletterForm.addEventListener('submit', async function (e) {
        e.preventDefault();
  
        const token = document.getElementById('_turnstile-newsletter').value;
        if (!token) {
          alert('Please complete the CAPTCHA verification');
          return;
        }
  
        const formData = new FormData(newsletterForm);
  
        try {
          const response = await fetch(newsletterForm.action, {
            method: 'POST',
            body: formData,
          });
  
          if (response.ok) {
            document.getElementById('newsletterFormContainer').style.display = 'none';
            document.getElementById('newsletter-confirmation').style.display = 'block';
          } else {
            throw new Error(`Server responded with status ${response.status}`);
          }
        } catch (error) {
          console.error('Newsletter form submission error:', error);
          alert('Failed to subscribe to the newsletter. Please try again later.');
        }
      });
    }
  });