
(function () {
    'use strict';

    var MEMBERSHIP_GST_RATE = 0.18;
    var currentMembershipFee = 0;
    var currentBaseFee = 0;
    var membershipBenefits = [];
    var membershipStories = [];
    var pincodeTimeout;
    var pincodeFetchAbort = null;
    var pincodeRequestSeq = 0;

    function handleMembershipTypeChange() {
        var membershipType = document.getElementById('membershipTypeSelect').value;
        var turnoverContainer = document.getElementById('annualTurnoverContainer');
        var turnoverSelect = document.getElementById('membershipTurnoverSelect');
        var feeDisplay = document.getElementById('membershipFeeDisplay');
        turnoverSelect.value = '';
        if (membershipType === 'annual') {
            turnoverContainer.classList.remove('hidden');
            turnoverSelect.setAttribute('required', 'required');
            if (feeDisplay) feeDisplay.classList.add('hidden');
        } else if (membershipType === 'startup') {
            turnoverContainer.classList.add('hidden');
            turnoverSelect.removeAttribute('required');
            displayFixedFee(25000, 'Startup Membership');
        } else if (membershipType === 'lifetime') {
            turnoverContainer.classList.add('hidden');
            turnoverSelect.removeAttribute('required');
            displayFixedFee(250000, 'Lifetime Membership');
        } else if (membershipType === 'patron') {
            turnoverContainer.classList.add('hidden');
            turnoverSelect.removeAttribute('required');
            displayFixedFee(500000, 'Patron Membership');
        } else {
            turnoverContainer.classList.add('hidden');
            turnoverSelect.removeAttribute('required');
            if (feeDisplay) feeDisplay.classList.add('hidden');
        }
    }

    function computePaymentTotals(baseFee) {
        var base = parseFloat(baseFee) || 0;
        if (base <= 0) return { baseFee: 0, gstAmount: 0, totalPayable: 0 };
        var gstAmount = Math.round(base * MEMBERSHIP_GST_RATE * 100) / 100;
        var totalPayable = Math.round((base + gstAmount) * 100) / 100;
        return { baseFee: base, gstAmount: gstAmount, totalPayable: totalPayable };
    }

    function displayFeeBreakdown(baseFee, typeName) {
        var feeDisplay = document.getElementById('membershipFeeDisplay');
        var originalFee = document.getElementById('originalFeeAmount');
        var gstFee = document.getElementById('gstFeeAmount');
        var finalFee = document.getElementById('finalFeeAmount');
        var discountRow = document.getElementById('discountRow');
        var membershipFeeTitle = document.getElementById('membershipFeeTitle');
        if (!feeDisplay || !originalFee || !finalFee) return;
        var totals = computePaymentTotals(baseFee);
        originalFee.textContent = totals.baseFee.toLocaleString('en-IN');
        if (gstFee) gstFee.textContent = totals.gstAmount.toLocaleString('en-IN');
        finalFee.textContent = totals.totalPayable.toLocaleString('en-IN');
        if (discountRow) discountRow.classList.add('hidden');
        if (membershipFeeTitle) membershipFeeTitle.textContent = typeName + ' Fee';
        feeDisplay.classList.remove('hidden');
        currentBaseFee = totals.baseFee;
        currentMembershipFee = totals.totalPayable;
    }

    function displayFixedFee(amount, typeName) {
        displayFeeBreakdown(amount, typeName);
    }

    function calculateMembershipFee() {
        var membershipTypeSelect = document.getElementById('membershipTypeSelect');
        var turnoverSelect = document.getElementById('membershipTurnoverSelect');
        var feeDisplay = document.getElementById('membershipFeeDisplay');
        var originalFeeEl = document.getElementById('originalFeeAmount');
        var finalFeeEl = document.getElementById('finalFeeAmount');
        var discountRow = document.getElementById('discountRow');
        var membershipFeeTitle = document.getElementById('membershipFeeTitle');
        if (!membershipTypeSelect || !turnoverSelect || !feeDisplay) return;
        var membershipType = membershipTypeSelect.value;
        var turnoverValue = turnoverSelect.value;
        if (membershipType !== 'annual') {
            feeDisplay.classList.add('hidden');
            return;
        }
        if (!turnoverValue) {
            feeDisplay.classList.add('hidden');
            return;
        }
        var baseFee = parseFloat(turnoverValue) || 0;
        if (baseFee <= 0) {
            feeDisplay.classList.add('hidden');
            return;
        }
        displayFeeBreakdown(baseFee, 'Annual Membership');
    }

    function getMembershipValidationErrors(data) {
        var errors = {};
        var trim = function (s) { return (s == null) ? '' : String(s).trim(); };
        if (!trim(data.fullName)) errors.fullName = 'Name is required';
        if (!trim(data.businessName)) errors.businessName = 'Business name is required';
        var email = trim(data.email);
        if (!email) errors.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Please enter a valid email address';
        if (!trim(data.password)) errors.password = 'Password is required';
        else if (String(data.password).length < 6) errors.password = 'Password must be at least 6 characters';
        var phone = trim(data.phone);
        if (!phone) errors.phone = 'Phone number is required';
        else if (!/^[0-9]{10}$/.test(phone)) errors.phone = 'Phone number must be exactly 10 digits';
        if (!trim(data.businessCategory)) errors.businessCategory = 'Please select a business category';
        if (!trim(data.businessType)) errors.businessType = 'Please select a business type';
        if (!trim(data.subBusinessCategory)) errors.subBusinessCategory = 'Please select a sub business category';
        if (!trim(data.membershipType)) errors.membershipType = 'Please select a membership type';
        if (trim(data.membershipType) === 'annual' && !trim(data.annualTurnover)) errors.annualTurnover = 'Please select annual turnover range for annual membership';
        var pincode = trim(data.pincode);
        if (!pincode) errors.pincode = 'Pincode is required';
        else if (!/^[0-9]{6}$/.test(pincode)) errors.pincode = 'Pincode must be 6 digits';
        if (!trim(data.state)) errors.state = 'State is required';
        if (!trim(data.city)) errors.city = 'City is required';
        if (!trim(data.yearsInBusiness)) errors.yearsInBusiness = 'Please select years in business';
        if (!trim(data.businessAddress)) errors.businessAddress = 'Business address is required';
        var udyam = trim(data.udyamRegistrationNumber);
        if (udyam) {
            var u = udyam.toUpperCase().replace(/\s/g, '');
            var withPrefix = u.indexOf('UDYAM-') === 0 ? u : 'UDYAM-' + u;
            var newFmt = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
            var legacyFmt = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{7}$/;
            if (!newFmt.test(withPrefix) && !legacyFmt.test(u)) errors.udyamRegistrationNumber = 'Invalid Udyam format. Use e.g. MH-01-0001234';
        }
        return errors;
    }

    function clearAllMembershipFieldErrors(form) {
        if (!form) form = document.getElementById('membershipApplicationForm');
        if (!form) return;
        form.querySelectorAll('.membership-input-invalid').forEach(function (el) { el.classList.remove('membership-input-invalid'); });
        var udyamWrap = document.getElementById('udyamRegistrationNumberWrapper');
        if (udyamWrap) udyamWrap.classList.remove('membership-input-invalid');
        form.querySelectorAll('[data-field-error]').forEach(function (span) {
            span.textContent = '';
            span.classList.add('hidden');
        });
    }

    function showMembershipFieldErrors(form, errors) {
        if (!form) form = document.getElementById('membershipApplicationForm');
        if (!form) return;
        clearAllMembershipFieldErrors(form);
        Object.keys(errors).forEach(function (name) {
            var el = form.querySelector('[name="' + name + '"]');
            var span = form.querySelector('[data-field-error="' + name + '"]');
            if (el) el.classList.add('membership-input-invalid');
            if (name === 'udyamRegistrationNumber') {
                var w = document.getElementById('udyamRegistrationNumberWrapper');
                if (w) w.classList.add('membership-input-invalid');
            }
            if (span) { span.textContent = errors[name]; span.classList.remove('hidden'); }
        });
    }

    function clearMembershipFieldError(form, fieldName) {
        if (!form) form = document.getElementById('membershipApplicationForm');
        var el = form && form.querySelector('[name="' + fieldName + '"]');
        var span = form && form.querySelector('[data-field-error="' + fieldName + '"]');
        if (el) el.classList.remove('membership-input-invalid');
        if (fieldName === 'udyamRegistrationNumber') {
            var w = document.getElementById('udyamRegistrationNumberWrapper');
            if (w) w.classList.remove('membership-input-invalid');
        }
        if (span) { span.textContent = ''; span.classList.add('hidden'); }
    }

    function validateMembershipFieldOnBlur(form, name) {
        var data = {};
        new FormData(form).forEach(function (v, k) { data[k] = v; });
        var errors = getMembershipValidationErrors(data);
        if (errors[name]) {
            var el = form.querySelector('[name="' + name + '"]');
            var span = form.querySelector('[data-field-error="' + name + '"]');
            if (el) el.classList.add('membership-input-invalid');
            if (span) { span.textContent = errors[name]; span.classList.remove('hidden'); }
        } else {
            clearMembershipFieldError(form, name);
        }
    }

    function setupMembershipFormValidation() {
        var form = document.getElementById('membershipApplicationForm');
        if (!form) return;
        form.addEventListener('blur', function (e) {
            var t = e.target;
            if ((t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') && t.name && !t.hasAttribute('data-field-error')) {
                validateMembershipFieldOnBlur(form, t.name);
            }
        }, true);
        form.addEventListener('input', function (e) {
            var t = e.target;
            if (t.name && !t.hasAttribute('data-field-error')) validateMembershipFieldOnBlur(form, t.name);
        }, true);
        form.addEventListener('change', function (e) {
            var t = e.target;
            if (t.name && !t.hasAttribute('data-field-error')) validateMembershipFieldOnBlur(form, t.name);
        }, true);
    }

    var razorpayKeyId = null;
    var razorpayScriptLoaded = false;

    function loadRazorpayScript() {
        if (window.Razorpay) {
            razorpayScriptLoaded = true;
            return Promise.resolve();
        }
        if (razorpayScriptLoaded) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://checkout.razorpay.com/v1/checkout.js';
            s.async = true;
            s.onload = function () {
                razorpayScriptLoaded = true;
                resolve();
            };
            s.onerror = function () { reject(new Error('Failed to load Razorpay checkout')); };
            document.head.appendChild(s);
        });
    }

    function preloadPaymentCheckout() {
        loadRazorpayScript()
            .then(function () {
                return fetch('/api/config').then(function (r) { return r.ok ? r.json() : {}; });
            })
            .then(function (cfg) {
                if (cfg.razorpayKeyId) razorpayKeyId = cfg.razorpayKeyId;
            })
            .catch(function () { /* warm-up only */ });
    }

    async function openPaymentCheckout(paymentSessionId, paymentLink, checkoutOpts) {
        checkoutOpts = checkoutOpts || {};
        if (paymentLink) {
            window.location.href = paymentLink;
            return;
        }
        if (!paymentSessionId) {
            throw new Error('Unable to open payment page');
        }

        var key = checkoutOpts.razorpayKeyId || razorpayKeyId;
        var merchantOrderId = checkoutOpts.orderId;
        if (!key) {
            var cfgRes = await fetch('/api/config');
            var cfg = cfgRes.ok ? await cfgRes.json() : {};
            key = cfg.razorpayKeyId;
            if (!key) throw new Error('Payment gateway is not configured');
        }

        await loadRazorpayScript();
        if (!window.Razorpay) throw new Error('Razorpay checkout not loaded');

        var callbackUrl = checkoutOpts.callbackUrl
            || (window.location.origin + '/payment-status?orderId=' + encodeURIComponent(merchantOrderId || ''));

        return new Promise(function (resolve, reject) {
            var options = {
                key: key,
                name: 'CIMSME',
                description: 'Membership Fee (incl. 18% GST)',
                order_id: paymentSessionId,
                prefill: {
                    name: checkoutOpts.name || '',
                    email: checkoutOpts.email || '',
                    contact: checkoutOpts.phone || ''
                },
                theme: { color: '#3B82F6' },
                handler: function () {
                    window.location.href = callbackUrl;
                    resolve();
                },
                modal: {
                    ondismiss: function () {
                        var err = new Error('Payment cancelled');
                        err.code = 'PAYMENT_CANCELLED';
                        reject(err);
                    }
                }
            };

            var rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (resp) {
                var msg = (resp.error && resp.error.description) || 'Payment failed';
                reject(new Error(msg));
            });
            rzp.open();
        });
    }

    function showMembershipStatus(messageDiv, message, type) {
        var styles = {
            success: 'mb-6 p-4 rounded-xl text-sm font-medium bg-green-100 text-green-800',
            error: 'mb-6 p-4 rounded-xl text-sm font-medium bg-red-100 text-red-800',
            info: 'mb-6 p-4 rounded-xl text-sm font-medium bg-blue-100 text-blue-800',
            warning: 'mb-6 p-4 rounded-xl text-sm font-medium bg-amber-100 text-amber-900 border border-amber-200'
        };
        messageDiv.textContent = message;
        messageDiv.className = styles[type] || styles.error;
        messageDiv.classList.remove('hidden');
    }

    async function handleMembershipApplication(event) {
        event.preventDefault();
        var form = event.target;
        var formData = new FormData(form);
        var membershipData = Object.fromEntries(formData.entries());
        var submitBtn = document.getElementById('membershipSubmitBtn');
        var submitText = document.getElementById('membershipSubmitText');
        var messageDiv = document.getElementById('membershipMessage');
        clearAllMembershipFieldErrors(form);
        messageDiv.classList.add('hidden');
        var errors = getMembershipValidationErrors(membershipData);
        if (Object.keys(errors).length > 0) {
            showMembershipFieldErrors(form, errors);
            var firstErr = form.querySelector('.membership-input-invalid');
            if (firstErr) firstErr.focus();
            return;
        }
        try {
            submitBtn.disabled = true;
            submitText.textContent = 'Processing...';
            messageDiv.classList.add('hidden');
            var response = await fetch('/api/membership/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(membershipData)
            });
            var text = await response.text();
            var result = null;
            try { result = (text && text.trim()) ? JSON.parse(text) : null; } catch (_) { result = null; }
            if (!result || typeof result !== 'object') {
                showMembershipStatus(messageDiv, 'Something went wrong. Please try again or contact support.', 'error');
                return;
            }
            if (!result.success) {
                if (result.applicationSaved && result.canRetryPayment) {
                    showMembershipStatus(
                        messageDiv,
                        result.message || ('Application saved (Member ID: ' + (result.memberId || '') + '). Click "Apply for Membership" again to retry payment.'),
                        'warning'
                    );
                    submitText.textContent = 'Retry Payment';
                    return;
                }
                throw new Error(result.message || 'Application submission failed');
            }
            if (result.requiresPayment && (result.paymentSessionId || result.paymentLink)) {
                if (result.razorpayKeyId) razorpayKeyId = result.razorpayKeyId;
                showMembershipStatus(messageDiv, 'Application submitted! Opening secure payment page...', 'info');
                try {
                    await openPaymentCheckout(result.paymentSessionId, result.paymentLink, {
                        razorpayKeyId: result.razorpayKeyId,
                        orderId: result.orderId,
                        name: membershipData.fullName,
                        email: membershipData.email,
                        phone: membershipData.phone
                    });
                } catch (e) {
                    console.error('Razorpay checkout error:', e);
                    if (e && e.code === 'PAYMENT_CANCELLED') {
                        showMembershipStatus(
                            messageDiv,
                            'Payment cancelled. Your application is saved — click "Apply for Membership" again to complete payment.',
                            'warning'
                        );
                    } else {
                        showMembershipStatus(
                            messageDiv,
                            (e && e.message) || 'Application saved but payment could not open. Please click "Apply for Membership" again to retry.',
                            'warning'
                        );
                    }
                    submitText.textContent = 'Retry Payment';
                }
            } else {
                showMembershipStatus(messageDiv, 'Application submitted successfully!', 'success');
                setTimeout(function () {
                    alert('Welcome to CIMSME!\n\nMember ID: ' + result.memberId + '\nEmail: ' + membershipData.email + '\n\nYou can now log in using your email and password.\nA confirmation email has been sent.');
                }, 500);
                form.reset();
                var feeDisplay = document.getElementById('membershipFeeDisplay');
                if (feeDisplay) feeDisplay.classList.add('hidden');
            }
        } catch (error) {
            console.error('Membership submission error:', error);
            var isServerMessage = error && error.message && !/^(Failed to fetch|NetworkError|Load failed)/i.test(error.message);
            showMembershipStatus(
                messageDiv,
                isServerMessage ? error.message : 'Something went wrong. Please check your connection and try again, or contact support.',
                'error'
            );
        } finally {
            submitBtn.disabled = false;
            if (submitText.textContent === 'Processing...') {
                submitText.textContent = 'Apply for Membership';
            }
        }
    }

    function getCategoryGradient(category) {
        var gradients = {
            finance: 'linear-gradient(135deg, #3B82F6 0%, #1E3A8A 100%)',
            legal: 'linear-gradient(135deg, #10B981 0%, #065F46 100%)',
            networking: 'linear-gradient(135deg, #F59E0B 0%, #92400E 100%)',
            training: 'linear-gradient(135deg, #8B5CF6 0%, #5B21B6 100%)',
            market: 'linear-gradient(135deg, #6366F1 0%, #3730A3 100%)',
            general: 'linear-gradient(135deg, #6B7280 0%, #1F2937 100%)'
        };
        return gradients[category] || gradients.general;
    }

    function displayMembershipBenefits() {
        var container = document.getElementById('benefitsGrid');
        var loading = document.getElementById('benefitsLoading');
        if (loading) loading.style.display = 'none';
        if (!membershipBenefits || membershipBenefits.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500"><p>No benefits available at the moment</p></div>';
            return;
        }
        container.innerHTML = membershipBenefits.map(function (benefit) {
            var gradientStyle = getCategoryGradient(benefit.category);
            var features = benefit.description ? benefit.description.split('\n').filter(function (f) { return f.trim(); }) : [];
            return '<div class="rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition-all" style="background:' + gradientStyle + '">' +
                '<div class="w-12 h-12 bg-white bg-opacity-20 rounded-2xl flex items-center justify-center mb-4"><span class="text-2xl">' + (benefit.icon || '✓') + '</span></div>' +
                '<h3 class="text-xl font-bold mb-4">' + (benefit.title || '') + '</h3>' +
                (features.length > 0 ? '<ul class="space-y-2 text-sm">' + features.map(function (f) {
                    return '<li class="flex items-start"><span class="mr-2 text-yellow-400">✓</span><span class="text-white text-opacity-90">' + f.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span></li>';
                }).join('') + '</ul>' : '<p class="text-white text-opacity-90 text-sm">' + (benefit.description || 'No details available').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>') +
                '</div>';
        }).join('');
    }

    function displayMembershipStories() {
        var container = document.getElementById('successStoriesGrid');
        var loading = document.getElementById('storiesLoading');
        if (loading) loading.style.display = 'none';
        if (!membershipStories || membershipStories.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500"><p>No success stories available</p></div>';
            return;
        }
        container.innerHTML = membershipStories.map(function (story) {
            var logoHtml = story.logo
                ? '<div class="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 bg-gray-100 border-2 border-gray-200"><img src="' + story.logo.replace(/"/g, '&quot;') + '" alt="" class="w-full h-full object-cover" loading="lazy"></div>'
                : '<div class="w-12 h-12 ' + (story.avatarcolor || 'bg-blue-500') + ' rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">' + (story.initials || (story.name && story.name.charAt(0)) || '') + '</div>';
            var name = (story.name || '').replace(/"/g, '&quot;');
            var testimonial = (story.testimonial || '').replace(/"/g, '&quot;');
            return '<div class="bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-shadow duration-300 h-64 flex flex-col">' +
                '<div class="flex items-center mb-4">' + logoHtml +
                '<div class="ml-3 flex-1 min-w-0"><h4 class="text-lg font-bold text-gray-900 truncate">' + name + '</h4><p class="text-sm text-gray-600 truncate">' + (story.businesstype || '') + ', ' + (story.location || '') + '</p></div></div>' +
                '<p class="text-gray-700 leading-relaxed mb-3 flex-grow text-sm overflow-hidden">"' + testimonial + '"</p>' +
                '<div class="text-cimsme-green font-semibold text-sm mt-auto">' + (story.achievement || '') + '</div></div>';
        }).join('');
    }

    async function loadMembershipBenefits() {
        try {
            var response = await fetch('/api/membership/benefits');
            var result = await response.json();
            if (result.success) {
                membershipBenefits = result.data || [];
                displayMembershipBenefits();
            } else throw new Error(result.message);
        } catch (e) {
            console.error('Error loading benefits:', e);
            var bl = document.getElementById('benefitsLoading');
            if (bl) bl.innerHTML = '<div class="text-center py-8"><p class="text-red-500">Failed to load benefits</p><button type="button" onclick="location.reload()" class="bg-blue-500 text-white px-4 py-2 rounded-lg mt-2">Retry</button></div>';
        }
    }

    async function loadMembershipStories() {
        try {
            var response = await fetch('/api/membership/stories');
            var result = await response.json();
            if (result.success) {
                membershipStories = result.data || [];
                displayMembershipStories();
            } else throw new Error(result.message);
        } catch (e) {
            console.error('Error loading stories:', e);
            var sl = document.getElementById('storiesLoading');
            if (sl) sl.innerHTML = '<div class="text-center py-8"><p class="text-red-500">Failed to load success stories</p><button type="button" onclick="location.reload()" class="bg-blue-500 text-white px-4 py-2 rounded-lg mt-2">Retry</button></div>';
        }
    }

    function loadCommitteesForMembership() {
        var select = document.getElementById('interestedCommitteeIdSelect');
        if (!select) return;
        fetch('/api/committees')
            .then(function (r) { return r.json(); })
            .then(function (result) {
                var committees = (result && result.success && result.data) ? result.data : [];
                select.innerHTML = '<option value="">None / Skip</option>';
                committees.forEach(function (c) {
                    if (c && c.is_active !== false) {
                        var opt = document.createElement('option');
                        opt.value = String(c.id);
                        opt.textContent = (c.name || 'Committee').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        select.appendChild(opt);
                    }
                });
            })
            .catch(function () {
                select.innerHTML = '<option value="">None / Skip</option>';
            });
    }

    function enableManualLocationFields(stateInput, cityInput) {
        if (stateInput) stateInput.removeAttribute('readonly');
        if (cityInput) cityInput.removeAttribute('readonly');
    }

    function lockAutoLocationFields(stateInput, cityInput) {
        if (stateInput) stateInput.setAttribute('readonly', 'readonly');
        if (cityInput) cityInput.setAttribute('readonly', 'readonly');
    }

    function fetchLocationByPincode(rawPincode) {
        clearTimeout(pincodeTimeout);
        if (pincodeFetchAbort) {
            pincodeFetchAbort.abort();
            pincodeFetchAbort = null;
        }

        var pincode = String(rawPincode || '').replace(/\D/g, '').slice(0, 6);
        var pincodeInput = document.getElementById('pincodeInput');
        var statusEl = document.getElementById('pincodeStatus');
        var stateInput = document.getElementById('stateInput');
        var cityInput = document.getElementById('cityInput');

        if (pincodeInput && pincodeInput.value !== pincode) {
            pincodeInput.value = pincode;
        }

        if (pincode.length !== 6) {
            statusEl.classList.add('hidden');
            if (pincode.length === 0) {
                stateInput.value = '';
                cityInput.value = '';
            }
            return;
        }

        statusEl.textContent = ' Fetching location...';
        statusEl.className = 'text-xs mt-1 text-blue-600';
        statusEl.classList.remove('hidden');

        pincodeTimeout = setTimeout(function () {
            var requestId = ++pincodeRequestSeq;
            var activePincode = pincode;
            var controller = new AbortController();
            pincodeFetchAbort = controller;

            fetch('/api/pincode/' + encodeURIComponent(activePincode), {
                signal: controller.signal,
                headers: { Accept: 'application/json' }
            })
                .then(function (response) {
                    return response.json().catch(function () { return {}; }).then(function (data) {
                        return { response: response, data: data };
                    });
                })
                .then(function (result) {
                    if (requestId !== pincodeRequestSeq) return;

                    var currentPincode = String(document.getElementById('pincodeInput')?.value || '').replace(/\D/g, '').slice(0, 6);
                    if (currentPincode !== activePincode) return;

                    var response = result.response;
                    var data = result.data || {};

                    if (response.status === 400) {
                        statusEl.textContent = ' Enter a valid 6-digit pincode';
                        statusEl.className = 'text-xs mt-1 text-orange-600';
                        enableManualLocationFields(stateInput, cityInput);
                        return;
                    }

                    if (response.status === 404) {
                        statusEl.textContent = ' Pincode not found. Enter city/state manually';
                        statusEl.className = 'text-xs mt-1 text-orange-600';
                        stateInput.value = '';
                        cityInput.value = '';
                        enableManualLocationFields(stateInput, cityInput);
                        return;
                    }

                    if (!response.ok) {
                        statusEl.textContent = ' Location service busy. Try again or enter manually';
                        statusEl.className = 'text-xs mt-1 text-orange-600';
                        enableManualLocationFields(stateInput, cityInput);
                        return;
                    }

                    if (data.success && data.state && data.city) {
                        stateInput.value = data.state;
                        cityInput.value = data.city;
                        lockAutoLocationFields(stateInput, cityInput);
                        statusEl.textContent = ' ' + data.city + ', ' + data.state;
                        statusEl.className = 'text-xs mt-1 text-green-600';
                        clearMembershipFieldError(document.getElementById('membershipApplicationForm'), 'state');
                        clearMembershipFieldError(document.getElementById('membershipApplicationForm'), 'city');
                        clearMembershipFieldError(document.getElementById('membershipApplicationForm'), 'pincode');
                        return;
                    }

                    statusEl.textContent = ' Could not resolve location. Enter city/state manually';
                    statusEl.className = 'text-xs mt-1 text-orange-600';
                    enableManualLocationFields(stateInput, cityInput);
                })
                .catch(function (err) {
                    if (err && err.name === 'AbortError') return;
                    if (requestId !== pincodeRequestSeq) return;
                    statusEl.textContent = ' Network error. Try again or enter city/state manually';
                    statusEl.className = 'text-xs mt-1 text-orange-600';
                    enableManualLocationFields(stateInput, cityInput);
                })
                .finally(function () {
                    if (pincodeFetchAbort === controller) pincodeFetchAbort = null;
                });
        }, 400);
    }

    async function loadMembershipData() {
        try {
            preloadPaymentCheckout();
            loadCommitteesForMembership();
            await Promise.all([loadMembershipBenefits(), loadMembershipStories()]);
        } catch (e) {
            console.error('Error loading membership data:', e);
        }
    }

    window.handleMembershipTypeChange = handleMembershipTypeChange;
    window.calculateMembershipFee = calculateMembershipFee;
    window.handleMembershipApplication = handleMembershipApplication;
    window.fetchLocationByPincode = fetchLocationByPincode;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setupMembershipFormValidation();
            loadMembershipData();
        });
    } else {
        setupMembershipFormValidation();
        loadMembershipData();
    }
})();
