// Worksetu — unified frontend logic.
// UI/UX layer: the new design (index.html, translations.js, this file's
// presentation helpers — toasts, SVG icons, scroll-reveal, service
// search/filter, multi-step wizard, notification dropdown, live-map
// visuals) is preserved from the incoming redesign.
// Data/business layer: every interaction that the incoming redesign
// simulated locally (fake login matching mockData, fake booking objects
// pushed into a local array, fake dispatch cascades via setInterval) is
// replaced here with real calls through window.ApiClient (api.js) against
// the existing backend — same real contract already proven throughout
// this project's Jest/Playwright suites. Real API responses are
// normalized into the exact field names/shapes the existing template
// bindings already expect (e.g. profile.fullName -> .name), so index.html
// did not need to be rewritten to consume real data.
const { createApp, ref, reactive, computed, onMounted, onUnmounted, watch } = Vue;
const api = window.ApiClient;

const app = createApp({
  setup() {
    // ----------------------------------------------------
    // Theme & Language State
    // ----------------------------------------------------
    const theme = ref(localStorage.getItem("theme") || "light");
    const language = ref(localStorage.getItem("language") || "en");

    // ----------------------------------------------------
    // Role & Navigation Routing
    // ----------------------------------------------------
    const currentRole = ref("landing"); // landing, customer, worker, admin
    const currentView = ref("home");

    // ----------------------------------------------------
    // Auth / Session State (real JWT + httpOnly refresh cookie, Section 6)
    // ----------------------------------------------------
    const loggedInCustomer = ref(null);
    const loggedInWorker = ref(null);
    const loggedInAdmin = ref(null);
    const loginError = ref("");
    const registerError = ref("");
    const showPassword = ref(false);
    const authBusy = ref(false);
    const socketConnected = ref(false);

    const currentActiveUser = computed(() => {
      if (currentRole.value === "customer") return loggedInCustomer.value;
      if (currentRole.value === "worker") return loggedInWorker.value;
      if (currentRole.value === "admin") return loggedInAdmin.value;
      return loggedInCustomer.value || loggedInWorker.value || loggedInAdmin.value || null;
    });

    // Auth Form Bindings
    const authEmail = ref("");
    const authPassword = ref("");
    const authName = ref("");
    const authPhone = ref("");
    const authAddress = ref("");
    const authCoop = ref("");
    const authSkill = ref("");
    const authExperience = ref("");
    const authServiceRadiusKm = ref(5);

    // ----------------------------------------------------
    // Toast Notifications (presentation-only, unchanged)
    // ----------------------------------------------------
    const toasts = ref([]);
    const showToast = (title, message = "", type = "info", duration = 3500) => {
      const id = Date.now() + Math.random();
      toasts.value.push({ id, title, message, type });
      setTimeout(() => dismissToast(id), duration);
    };
    const dismissToast = (id) => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    };

    function apiErrorMessage(err) {
      if (err instanceof api.ApiError) return err.message;
      return t("noDataFound");
    }

    // ----------------------------------------------------
    // Services & Cooperatives (Section 4.2 public catalog — real)
    // ----------------------------------------------------
    const services = ref([]);
    const cooperatives = ref([]);
    async function loadCatalog() {
      const [svc, coop] = await Promise.all([
        api.request("GET", "/services").catch(() => []),
        api.request("GET", "/public/cooperatives").catch(() => [])
      ]);
      services.value = svc;
      cooperatives.value = coop;
    }

    const platformStats = ref({ totalWorkers: 0, completedBookings: 0, activeCooperatives: 0 });
    async function loadPlatformStats() {
      platformStats.value = await api.request("GET", "/public/stats").catch(() => platformStats.value);
    }

    // ----------------------------------------------------
    // Interactive Service Search, Categories & Quick Preview (UI-only, over real `services`)
    // ----------------------------------------------------
    const serviceSearchQuery = ref("");
    const selectedServiceCategory = ref("all");
    const previewService = ref(null);
    const isSubmittingRequest = ref(false);

    const serviceCategories = [
      { id: "all", label: "All Services", icon: "fa-solid fa-grid-2" },
      { id: "repairs", label: "Home Repairs", icon: "fa-solid fa-wrench" },
      { id: "cleaning", label: "Cleaning", icon: "fa-solid fa-sparkles" },
      { id: "care", label: "Care & Domestic", icon: "fa-solid fa-heart" },
      { id: "outdoor", label: "Outdoor", icon: "fa-solid fa-seedling" }
    ];

    const serviceDescriptions = {
      plumbing: "Certified leak repairs, pipe fitting, faucet replacement, drainage unclogging, and sanitary installations.",
      electrical: "Safe circuit repairs, switchboard wiring, appliance points, MCB replacement, and lighting installations.",
      carpentry: "Furniture repairs, door and lock fitting, hinges, customized woodwork, and cabinet fixtures.",
      painting: "Interior and exterior wall touch-ups, waterproofing, putty prep, and full apartment repainting.",
      cleaning: "Comprehensive deep sanitation for kitchens, bathrooms, floors, and upholstery using eco-grade supplies.",
      gardening: "Lawn trimming, plant potting, organic weeding, pest prevention, and garden landscape upkeep.",
      caregiving: "Dignified elderly assistance, patient bedside companionship, medication reminders, and vital checks.",
      domestichelp: "Reliable kitchen prep, utensil washing, dusting, and scheduled household housekeeping.",
      ac: "Split & window AC servicing, gas charging, filter sanitization, cooling diagnostic, and chemical wash."
    };
    const getServiceDescription = (serviceId) => serviceDescriptions[serviceId] || "Verified union specialists equipped with regulated cooperative standards.";

    const filteredServices = computed(() => {
      let list = services.value || [];
      if (selectedServiceCategory.value !== "all") {
        if (selectedServiceCategory.value === "repairs") list = list.filter((s) => ["plumbing", "electrical", "carpentry", "painting", "ac"].includes(s.id));
        else if (selectedServiceCategory.value === "cleaning") list = list.filter((s) => ["cleaning"].includes(s.id));
        else if (selectedServiceCategory.value === "care") list = list.filter((s) => ["caregiving", "domestichelp"].includes(s.id));
        else if (selectedServiceCategory.value === "outdoor") list = list.filter((s) => ["gardening"].includes(s.id));
      }
      const query = serviceSearchQuery.value.trim().toLowerCase();
      if (query) {
        list = list.filter((s) => {
          const name = (t(s.translationKey) || s.id).toLowerCase();
          const desc = (serviceDescriptions[s.id] || "").toLowerCase();
          return name.includes(query) || desc.includes(query) || s.id.toLowerCase().includes(query);
        });
      }
      return list;
    });

    const openServicePreview = (svc) => {
      previewService.value = svc;
      showToast(`Quick Preview: ${t(svc.translationKey)}`, `Base: ${formatCurrency(svc.baseRate)} • ${formatCurrency(svc.hourlyRate)}/hr. Click 'Request Service' to proceed.`, "info", 3000);
    };
    const closeServicePreview = () => (previewService.value = null);

    // Recent services: derived from the customer's own real booking history
    // once loaded (loadCustomerBookings), rather than hardcoded demo rows.
    const recentServices = ref([]);
    const selectRecentService = (serviceId) => {
      const svc = services.value.find((s) => s.id === serviceId);
      if (svc) {
        openServicePreview(svc);
        showToast(`Selected Recent Service: ${t(svc.translationKey)}`, "Preview opened above", "info", 2500);
      }
    };

    const useCurrentLocation = () => {
      const applyCoords = async () => {
        const { lat, lng } = await getCoordinates();
        lastKnownCoords = { lat, lng };
      };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async () => {
            await applyCoords();
            showToast("Location Detected", "Using your device's current GPS position for this booking.", "success", 3000);
          },
          () => showToast("Location Unavailable", "Couldn't read GPS — type your address manually.", "warning", 3000),
          { timeout: 2500 }
        );
      } else {
        showToast("Location Unavailable", "This browser has no geolocation — type your address manually.", "warning", 3000);
      }
    };

    const setQuickDatePreset = (preset) => {
      const now = new Date();
      if (preset === "today_2h") {
        requestForm.value.datetime = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
        showToast("Schedule Updated", "Set for Today in 2 hours", "info", 2000);
      } else if (preset === "tomorrow_morning") {
        const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        d.setHours(9, 0, 0, 0);
        requestForm.value.datetime = d.toISOString().slice(0, 16);
        showToast("Schedule Updated", "Set for Tomorrow at 9:00 AM", "info", 2000);
      } else if (preset === "tomorrow_evening") {
        const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        d.setHours(16, 0, 0, 0);
        requestForm.value.datetime = d.toISOString().slice(0, 16);
        showToast("Schedule Updated", "Set for Tomorrow at 4:00 PM", "info", 2000);
      }
    };

    // ----------------------------------------------------
    // Service Request Form + Multi-Step Wizard (UI-only)
    // ----------------------------------------------------
    const requestForm = ref({
      serviceId: "plumbing",
      location: "",
      description: "",
      datetime: "",
      urgency: "NORMAL", // real backend enum: NORMAL | URGENT
      baseRate: 250,
      hourlyRate: 150,
      estimate: 250
    });
    const requestStep = ref(1);
    const nextRequestStep = () => {
      if (requestStep.value === 1 && !requestForm.value.serviceId) return showToast("Service Required", "Please choose a service to proceed", "warning", 2500);
      if (requestStep.value === 2 && !requestForm.value.datetime) return showToast("Time Required", "Please select a date and time", "warning", 2500);
      if (requestStep.value === 3 && (!requestForm.value.location || requestForm.value.location.trim().length < 3)) return showToast("Location Required", "Please enter your address or detect location", "warning", 2500);
      if (requestStep.value < 4) requestStep.value++;
    };
    const prevRequestStep = () => {
      if (requestStep.value > 1) requestStep.value--;
      else navigateTo("dashboard");
    };
    const canContinueRequestStep = computed(() => {
      if (requestStep.value === 1) return !!requestForm.value.serviceId;
      if (requestStep.value === 2) return !!requestForm.value.datetime;
      if (requestStep.value === 3) return !!requestForm.value.location && requestForm.value.location.trim().length >= 3;
      return true;
    });
    const goToRequestStep = (step) => {
      if (step === 1) requestStep.value = 1;
      else if (step === 2 && (requestStep.value > 2 || requestForm.value.serviceId)) requestStep.value = 2;
      else if (step === 3 && (requestStep.value > 3 || (requestForm.value.serviceId && requestForm.value.datetime))) requestStep.value = 3;
      else if (step === 4 && requestForm.value.serviceId && requestForm.value.datetime && requestForm.value.location) requestStep.value = 4;
    };

    // ----------------------------------------------------
    // Customer Booking / Dispatch (REAL — replaces the simulated cascade)
    // ----------------------------------------------------
    const customerBookings = ref([]); // GET /customers/me/bookings
    const activeBookingId = ref(localStorage.getItem("activeBookingId_sih2026") || null);
    const activeBooking = ref(null); // GET /bookings/:id
    const dispatchCandidates = ref({ phase: null, candidates: [] }); // GET /dispatch/:id/candidates

    watch(activeBookingId, (newId) => {
      if (newId) localStorage.setItem("activeBookingId_sih2026", newId);
      else localStorage.removeItem("activeBookingId_sih2026");
    });

    // Real-data equivalents of the redesign's "matchingTopWorkers" /
    // "matchingWiderPool" / "matchingPhase" / "cascadeStep" display
    // concepts, all derived from the one real candidates list + booking
    // status rather than a locally-simulated cascade.
    const matchingPhase = computed(() => {
      if (!activeBooking.value) return "idle";
      if (activeBooking.value.status === "DISPATCHING_TOP3") return "top3";
      if (activeBooking.value.status === "DISPATCHING_POOL") return "wider";
      if (["ASSIGNED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "SETTLED"].includes(activeBooking.value.status)) return "assigned";
      return "idle";
    });
    const OFFER_TO_DISPLAY = { WAITING: "Waiting", ACCEPTED: "Accepted", DECLINED: "Declined", TIMEOUT: "Timeout", LOCK_LOST: "Declined" };
    const toDisplayCandidate = (c) => ({
      id: c.workerId,
      name: c.name,
      cooperative: c.cooperativeName,
      rating: c.rating,
      distance: c.distanceKm,
      experience: c.experienceYears,
      phone: null,
      status: OFFER_TO_DISPLAY[c.offerStatus] || c.offerStatus,
      currentStatus: OFFER_TO_DISPLAY[c.offerStatus] || c.offerStatus
    });
    const matchingTopWorkers = computed(() => (dispatchCandidates.value.phase === "TOP3" ? dispatchCandidates.value.candidates.map(toDisplayCandidate) : []));
    const matchingWiderPool = computed(() => (dispatchCandidates.value.phase === "POOL" ? dispatchCandidates.value.candidates.map(toDisplayCandidate) : []));
    const matchingTimer = ref(0); // display-only countdown; real timeout is enforced server-side
    const cascadeStep = computed(() => (matchingPhase.value === "assigned" ? "assigned" : matchingPhase.value === "wider" ? "pool" : "top"));
    const cascadeStatusMessage = computed(() => {
      if (cascadeStep.value === "assigned") return "Worker assigned! Confirmation dispatched.";
      if (matchingPhase.value === "wider") return "Continuity dispatch active: request broadcast across the wider cooperative pool.";
      const w = matchingTopWorkers.value[0];
      return w ? `Priority dispatch: contacting ${w.name} (top match)...` : "Dispatching request to verified cooperative members...";
    });
    const demoLogs = ref([]); // kept as a lightweight live-activity feed, populated from real events below
    const addDemoLog = (message) => demoLogs.value.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
    const resetMatchingTimer = () => {}; // no-op: real dispatch timing is server-enforced, not client-resettable
    const simulateCascadeNextStep = () => {}; // no-op: kept only so any leftover template reference doesn't error
    // The redesign's "Interactive Demo" toolbar forced a simulated accept.
    // Real assignment only happens when a worker accepts the offer, so these
    // explain that instead of faking it.
    const explainRealDispatch = () => showToast("Live dispatch", "Assignment happens when a matched worker accepts the offer from their dashboard.", "info", 3500);
    const simulateWorkerAcceptancePathA = explainRealDispatch;
    const simulatePoolWorkerAcceptance = explainRealDispatch;
    const isMatchingSearching = ref(false);
    const expandedWorkerId = ref(null);
    const selectedMatchingWorkerId = ref(null);
    const toggleExpandWorker = (workerId) => (expandedWorkerId.value = expandedWorkerId.value === workerId ? null : workerId);
    const selectMatchingWorker = (workerId) => {
      selectedMatchingWorkerId.value = workerId;
      showToast("Worker Selected", "Priority assignment chosen.", "info", 2000);
    };

    let lastKnownCoords = null;
    function getCoordinates() {
      if (lastKnownCoords) return Promise.resolve(lastKnownCoords);
      return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve({ lat: 13.0827, lng: 80.2707 });
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve({ lat: 13.0827, lng: 80.2707 }),
          { timeout: 4000 }
        );
      });
    }

    const selectService = (serviceId) => {
      const svc = services.value.find((s) => s.id === serviceId);
      if (!svc) return;
      requestForm.value.serviceId = serviceId;
      requestForm.value.baseRate = svc.baseRate;
      requestForm.value.hourlyRate = svc.hourlyRate;
      requestForm.value.estimate = svc.baseRate + svc.hourlyRate;
      requestForm.value.location = loggedInCustomer.value?.address || "";
      requestForm.value.description = "";
      requestForm.value.datetime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
      requestStep.value = 2;
      showToast(`Selected: ${t(svc.translationKey)}`, "Step 2: Choose schedule & timing", "info", 2500);
      navigateTo("requestForm");
    };

    const handleRequestSubmit = async () => {
      if (isSubmittingRequest.value) return;
      isSubmittingRequest.value = true;
      isMatchingSearching.value = true;
      const { lat, lng } = await getCoordinates();
      const res = await api
        .request("POST", "/bookings/request", {
          idempotencyKey: api.idempotencyKey(),
          body: {
            serviceCategoryId: requestForm.value.serviceId,
            location: { address: requestForm.value.location, lat, lng },
            description: requestForm.value.description || "General maintenance requested",
            scheduledAt: null,
            urgency: requestForm.value.urgency
          }
        })
        .catch((err) => {
          loginError.value = apiErrorMessage(err);
          return null;
        });
      isMatchingSearching.value = false;
      isSubmittingRequest.value = false;
      if (!res) return;

      activeBookingId.value = res.bookingId;
      addDemoLog(`Booking ${res.bookingId} created. Dispatch started.`);
      await refreshActiveBooking();
      navigateTo("matching");
    };

    async function refreshActiveBooking() {
      if (!activeBookingId.value) return;
      activeBooking.value = await api.request("GET", `/bookings/${activeBookingId.value}`).catch(() => activeBooking.value);
      if (activeBooking.value && ["DISPATCHING_TOP3", "DISPATCHING_POOL"].includes(activeBooking.value.status)) {
        dispatchCandidates.value = await api.request("GET", `/dispatch/${activeBookingId.value}/candidates`).catch(() => dispatchCandidates.value);
      }
      if (activeBooking.value && ["ASSIGNED", "CONFIRMED", "IN_PROGRESS"].includes(activeBooking.value.status) && currentView.value === "matching") {
        navigateTo("bookingConfirmed");
      }
    }

    let candidatePollInterval = null;
    watch(activeBooking, (booking) => {
      if (candidatePollInterval) clearInterval(candidatePollInterval);
      if (booking && ["DISPATCHING_TOP3", "DISPATCHING_POOL"].includes(booking.status)) {
        candidatePollInterval = setInterval(() => {
          if (!socketConnected.value) refreshActiveBooking();
        }, 4000);
      }
    });

    async function loadCustomerBookings() {
      const res = await api.request("GET", "/customers/me/bookings").catch(() => null);
      if (res) {
        customerBookings.value = res.items;
        recentServices.value = res.items.slice(0, 3).map((b) => ({ id: b.serviceCategoryId, label: getServiceName(b.serviceCategoryId), location: b.location?.address || "", date: formatDate(b.createdAt) }));
      }
    }

    const bookings = customerBookings; // template-compat alias where the new UI iterates `bookings`

    const viewBooking = async (bookingId) => {
      activeBookingId.value = bookingId;
      await refreshActiveBooking();
      navigateTo(activeBooking.value && ["DISPATCHING_TOP3", "DISPATCHING_POOL"].includes(activeBooking.value.status) ? "matching" : "bookingConfirmed");
    };

    const cancelBooking = async (bookingId, reason) => {
      await api.request("POST", `/bookings/${bookingId}/cancel`, { body: { reason: reason || undefined } }).catch((err) => (loginError.value = apiErrorMessage(err)));
      await Promise.all([refreshActiveBooking(), loadCustomerBookings()]);
    };

    // Rating Modal — real submit (POST /bookings/:id/review)
    const ratingModal = ref({ show: false, bookingId: null, punctuality: 5, quality: 5, professionalism: 5, communication: 5, rating: 5, review: "" });
    const completeJob = (bookingId) => {
      ratingModal.value = { show: true, bookingId, punctuality: 5, quality: 5, professionalism: 5, communication: 5, rating: 5, review: "" };
    };
    const submitRating = async () => {
      const m = ratingModal.value;
      const stars = m.rating || 5;
      try {
        await api.request("POST", `/bookings/${m.bookingId}/review`, {
          idempotencyKey: api.idempotencyKey(),
          body: { punctuality: m.punctuality || stars, quality: m.quality || stars, professionalism: m.professionalism || stars, communication: m.communication || stars, writtenFeedback: m.review || undefined }
        });
        addDemoLog(`Rating submitted for booking ${m.bookingId}.`);
      } catch (err) {
        loginError.value = apiErrorMessage(err);
      }
      ratingModal.value.show = false;
      activeBookingId.value = null;
      activeBooking.value = null;
      await loadCustomerBookings();
      navigateTo("myBookings");
    };

    // Payment — Section 14.7 honest "Coming Soon" gateway
    const paymentGatewayModal = ref({ show: false, bookingId: null });
    const paymentMethodError = ref("");
    const openPaymentMethod = (bookingId) => {
      paymentMethodError.value = "";
      paymentGatewayModal.value = { show: true, bookingId };
    };
    const choosePaymentMethod = async (method) => {
      paymentMethodError.value = "";
      try {
        await api.request("POST", `/bookings/${paymentGatewayModal.value.bookingId}/payment-method`, { body: { paymentMethod: method } });
        paymentGatewayModal.value.show = false;
      } catch (err) {
        paymentMethodError.value = err instanceof api.ApiError && err.code === "PAYMENT_GATEWAY_NOT_CONFIGURED" ? t("paymentGatewayComingSoonBody") : apiErrorMessage(err);
      }
    };

    // ----------------------------------------------------
    // Worker Dashboard (REAL)
    // ----------------------------------------------------
    const workerBookings = ref([]);
    const workerIncoming = ref([]); // GET /workers/me/incoming
    const workerActiveJob = ref(null);
    const activeWorkerJob = workerActiveJob; // template-compat alias
    const workerJobHistory = ref([]);
    const walletInfo = ref({ availableBalance: 0, pendingBalance: 0, dividendPayoutTotal: 0, dividendSharePercent: 0, todayEarnings: 0, workingLocation: "", serviceAreaRadiusKm: 0, transactions: [] });
    const incentivesList = ref([]);
    const welfareInfo = ref({ hoursWorkedToday: 0, hoursWorkedThisWeek: 0, consecutiveJobStreak: 0, restRecommended: false });
    const demandHeatmap = ref([]);
    const redemptionAmount = ref("");
    const redemptionError = ref("");
    const redemptionSuccess = ref("");
    const redemptionHistory = computed(() => (walletInfo.value.transactions || []).filter((tx) => tx.type === "REDEMPTION").map((tx) => ({ id: tx.id, date: formatDate(tx.createdAt), amount: tx.amount, status: tx.status })));
    const payoutMethod = ref("BANK_TRANSFER_MOCK");
    const earningsTab = ref("today");
    const earningsFilterService = ref("");
    const earningsFilterType = ref("");
    const earningsFilterDate = ref("Today");
    const showFilterDrawer = ref(false);
    const selectedOrder = ref(null);
    const selectedIncentive = ref(null);
    const workerDocuments = ref([]);
    const documentUploadError = ref("");
    const documentUploadSuccess = ref("");
    const isWorkerAccepting = ref(false);
    const isWorkerDeclining = ref(false);

    let locationPingInterval = null;

    async function loadWorkerIncoming() {
      workerIncoming.value = await api.request("GET", "/workers/me/incoming").catch(() => []);
    }
    // Real equivalent of the redesign's client-computed workerIncomingRequests.
    // GET /workers/me/incoming returns { dispatchLogId, bookingId,
    // serviceCategory, customerAreaLabel, distanceKm, estimatedTotal,
    // offerExpiresAt } — mapped onto the field names the templates read.
    const workerIncomingRequests = computed(() =>
      workerIncoming.value.map((o) => ({
        id: o.dispatchLogId,
        bookingId: o.bookingId,
        serviceId: o.serviceCategory,
        service: getServiceName(o.serviceCategory),
        location: o.customerAreaLabel,
        area: o.customerAreaLabel,
        estimatedPayment: o.estimatedTotal,
        estimatedEarnings: o.estimatedTotal,
        distance: o.distanceKm != null ? Number(o.distanceKm).toFixed(1) : "—",
        offerExpiresAt: o.offerExpiresAt
      }))
    );
    // The worker "Available Requests" list renders `demoWorkerRequests`;
    // it now shows the same real offers, with accept/decline going to
    // POST /dispatch/:dispatchLogId/respond.
    const demoWorkerRequests = computed(() =>
      workerIncomingRequests.value.map((r) => ({
        ...r,
        skill: r.service,
        time: r.offerExpiresAt ? `expires ${formatDate(r.offerExpiresAt)}` : "",
        eta: r.distance !== "—" ? Math.max(5, Math.round(Number(r.distance) * 4)) : "—"
      }))
    );
    const acceptDemoRequest = (req) => handleWorkerAccept(req.id);
    const rejectDemoRequest = (dispatchLogId) => handleWorkerReject(dispatchLogId);
    async function loadWorkerBookings() {
      const res = await api.request("GET", "/workers/me/bookings").catch(() => null);
      if (res) {
        workerBookings.value = res.items;
        workerJobHistory.value = res.items.filter((b) => ["COMPLETED", "SETTLED"].includes(b.status));
      }
    }
    async function loadWallet() {
      walletInfo.value = await api.request("GET", "/workers/me/wallet").catch(() => walletInfo.value);
    }
    async function loadIncentives() {
      incentivesList.value = await api.request("GET", "/workers/me/incentives").catch(() => []);
    }
    async function loadWelfare() {
      welfareInfo.value = await api.request("GET", "/workers/me/welfare").catch(() => welfareInfo.value);
    }
    async function loadDemandHeatmap() {
      demandHeatmap.value = await api.request("GET", "/workers/me/demand-heatmap").catch(() => []);
    }
    async function loadWorkerActiveJob() {
      const res = await api.request("GET", "/workers/me/bookings").catch(() => null);
      if (!res) return;
      workerActiveJob.value = res.items.find((b) => ["ASSIGNED", "CONFIRMED", "IN_PROGRESS"].includes(b.status)) || null;
    }
    async function loadWorkerDocuments() {
      // Section 16 — no list-documents endpoint exists; upload panel is write-only.
    }

    const toggleAvailability = async () => {
      const next = loggedInWorker.value.availabilityStatus === "AVAILABLE" ? "OFF_DUTY" : "AVAILABLE";
      try {
        await api.request("PATCH", "/workers/me/availability", { idempotencyKey: api.idempotencyKey(), body: { status: next } });
        loggedInWorker.value.availabilityStatus = next;
        loggedInWorker.value.status = next === "AVAILABLE" ? "Available" : "Off Duty";
        loggedInWorker.value.availability = loggedInWorker.value.status;
        if (next === "AVAILABLE") startLocationPinging();
        else if (locationPingInterval) {
          clearInterval(locationPingInterval);
          locationPingInterval = null;
        }
      } catch (err) {
        loginError.value = apiErrorMessage(err);
      }
    };
    function startLocationPinging() {
      if (locationPingInterval) clearInterval(locationPingInterval);
      const ping = async () => {
        const { lat, lng } = await getCoordinates();
        await api.request("POST", "/workers/location-ping", { body: { lat, lng } }).catch(() => {});
      };
      ping();
      locationPingInterval = setInterval(ping, 15000);
    }

    const handleWorkerAccept = async (dispatchLogId) => {
      if (isWorkerAccepting.value) return;
      isWorkerAccepting.value = true;
      try {
        await api.request("POST", `/dispatch/${dispatchLogId}/respond`, { idempotencyKey: api.idempotencyKey(), body: { response: "ACCEPT" } });
        showToast("Job Accepted!", "You have been assigned to this cooperative booking.", "success", 3000);
      } catch (err) {
        loginError.value = apiErrorMessage(err);
      }
      await Promise.all([loadWorkerIncoming(), loadWorkerActiveJob()]);
      isWorkerAccepting.value = false;
      currentView.value = "dashboard";
    };
    const handleWorkerReject = async (dispatchLogId) => {
      if (isWorkerDeclining.value) return;
      isWorkerDeclining.value = true;
      await api.request("POST", `/dispatch/${dispatchLogId}/respond`, { body: { response: "DECLINE" } }).catch(() => {});
      await loadWorkerIncoming();
      isWorkerDeclining.value = false;
      showToast("Request Passed", "The request has been routed to the next cooperative backup.", "info", 3000);
    };
    const workerOnTheWay = () => {}; // no dedicated backend transition for "en route" — ASSIGNED already covers pre-start

    const workerStartJob = async (bookingId) => {
      await api.request("PATCH", `/bookings/${bookingId}/start`).catch((err) => (loginError.value = apiErrorMessage(err)));
      await loadWorkerActiveJob();
    };
    const workerCompleteJob = async (bookingId) => {
      await api.request("PATCH", `/bookings/${bookingId}/complete`, { idempotencyKey: api.idempotencyKey() }).catch((err) => (loginError.value = apiErrorMessage(err)));
      await loadWorkerActiveJob();
      currentView.value = "dashboard";
    };

    const handleRedeem = async () => {
      redemptionError.value = "";
      redemptionSuccess.value = "";
      const amt = Number(redemptionAmount.value);
      if (!amt || amt <= 0) {
        redemptionError.value = t("insufficientBalance");
        return;
      }
      try {
        await api.request("POST", "/workers/me/wallet/redeem", { idempotencyKey: api.idempotencyKey(), body: { amount: amt, payoutMethod: payoutMethod.value } });
        redemptionAmount.value = "";
        redemptionSuccess.value = t("redeemButton");
        await loadWallet();
      } catch (err) {
        redemptionError.value = apiErrorMessage(err);
      }
    };

    const uploadDocument = async (file, documentType) => {
      documentUploadError.value = "";
      documentUploadSuccess.value = "";
      try {
        const res = await api.uploadFile("/workers/documents", file, { documentType });
        workerDocuments.value.unshift(res);
        documentUploadSuccess.value = `${t("save")}: ${res.scanStatus}`;
      } catch (err) {
        documentUploadError.value = apiErrorMessage(err);
      }
    };

    // ----------------------------------------------------
    // Notifications (real — shared across roles)
    // ----------------------------------------------------
    const notifications = ref([]);
    async function loadNotifications() {
      const res = await api.request("GET", "/notifications").catch(() => null);
      if (res) notifications.value = res.items;
    }
    const markNotificationRead = async (id) => {
      await api.request("PATCH", `/notifications/${id}/read`).catch(() => {});
      const n = notifications.value.find((x) => x.id === id);
      if (n) n.isRead = true;
    };
    const markAllNotificationsRead = async () => {
      await api.request("PATCH", "/notifications/read-all").catch(() => {});
      notifications.value.forEach((n) => (n.isRead = true));
    };
    // Header notification-dropdown UI (presentation) reads the same real list.
    const isNotificationDropdownOpen = ref(false);
    const isProfileMenuOpen = ref(false);
    const toggleNotifications = () => {
      isNotificationDropdownOpen.value = !isNotificationDropdownOpen.value;
      if (isNotificationDropdownOpen.value) isProfileMenuOpen.value = false;
    };
    const toggleProfileMenu = () => {
      isProfileMenuOpen.value = !isProfileMenuOpen.value;
      if (isProfileMenuOpen.value) isNotificationDropdownOpen.value = false;
    };
    const closeHeaderDropdowns = () => {
      isNotificationDropdownOpen.value = false;
      isProfileMenuOpen.value = false;
    };
    const userNotifications = computed(() => notifications.value.map((n) => ({ id: n.id, type: n.type, message: n.title || n.body, time: formatDate(n.createdAt), read: n.isRead })));
    const unreadUserNotificationsCount = computed(() => userNotifications.value.filter((n) => !n.read).length);
    const markAllUserNotificationsRead = markAllNotificationsRead;
    // Admin-side notification feed alias — the redesign's admin UI reads
    // `adminNotifications`; real audit/dispatch events populate it below.
    const adminNotifications = notifications;

    // ----------------------------------------------------
    // Admin Console (REAL)
    // ----------------------------------------------------
    const adminTab = ref("dashboard");
    const adminIsSuper = computed(() => !!loggedInAdmin.value?.isSuper);
    const adminDashboardRaw = ref({ totalWorkers: 0, availableWorkers: 0, totalCustomers: 0, activeBookings: 0, completedBookings: 0, totalCooperatives: 0, recentDispatchEvents: [] });
    const adminBookingsRaw = ref([]);
    const adminBookingsLedger = ref([]);
    const adminDispatchActive = ref([]);
    const adminLiveWorkersRaw = ref([]);
    const adminWorkersRaw = ref([]);
    const adminCustomersRaw = ref([]);
    const adminCooperatives = ref([]);
    const adminAuditLogs = ref([]);
    const adminReports = ref({ topSectors: [], ratingDistribution: [] });
    const adminConfig = ref({ commissionPercent: 15, top3TimeoutSeconds: 45, poolTimeoutSeconds: 120 });

    const selectedRequest = ref(null);
    const selectedWorker = ref(null);
    const selectedCustomer = ref(null);
    const selectedCooperative = ref(null);
    const selectedBooking = ref(null);

    const workerSearch = ref("");
    const workerFilterSkill = ref("");
    const workerFilterAvailability = ref("");
    const workerFilterCoop = ref("");
    const workerFilterVerification = ref("");
    const customerSearch = ref("");
    const customerFilterStatus = ref("");
    const requestSearch = ref("");
    const requestFilterStatus = ref("");
    const bookingSearch = ref("");
    const bookingFilterStatus = ref("");

    const showAddServiceModal = ref(false);
    const showEditServiceModal = ref(false);
    const newServiceData = ref({ id: "", translationKey: "", baseRate: 200, hourlyRate: 100, icon: "wrench" });
    const editingServiceData = ref({ id: "", baseRate: 0, hourlyRate: 0, isEnabled: true });
    const forceAssignForm = ref({ workerId: "", reason: "" });
    const forceAssignError = ref("");
    const adminCancelReason = ref("");
    const rejectionReasonInput = ref("");
    const suspendReasonInput = ref("");
    const broadcastForm = ref({ audience: "ALL_CUSTOMERS", title: "", body: "" });
    const broadcastResult = ref("");
    const newCooperativeData = ref({ name: "", location: "", registrationNumber: "" });
    const walletAdjustmentForm = ref({ workerProfileId: "", amount: "", direction: "CREDIT", reason: "" });
    const walletAdjustmentResult = ref("");
    const demoResetBusy = ref(false);
    const demoResetResult = ref("");

    async function loadAdminDashboard() {
      adminDashboardRaw.value = await api.request("GET", "/admin/dashboard/summary").catch(() => adminDashboardRaw.value);
    }
    async function loadAdminBookings() {
      const res = await api.request("GET", "/admin/bookings", { params: { status: requestFilterStatus.value } }).catch(() => null);
      if (res) adminBookingsRaw.value = res.items;
    }
    async function loadAdminBookingsLedger() {
      const res = await api.request("GET", "/admin/bookings/ledger", { params: { status: bookingFilterStatus.value } }).catch(() => null);
      if (res) adminBookingsLedger.value = res.items;
    }
    async function loadAdminDispatchActive() {
      adminDispatchActive.value = await api.request("GET", "/admin/dispatch/active").catch(() => []);
    }
    async function loadAdminLiveWorkers() {
      adminLiveWorkersRaw.value = await api.request("GET", "/admin/live/workers").catch(() => []);
    }
    async function loadAdminWorkers() {
      const res = await api.request("GET", "/admin/workers", { params: { verificationStatus: workerFilterVerification.value } }).catch(() => null);
      if (res) adminWorkersRaw.value = res.items;
    }
    async function loadAdminCustomers() {
      const res = await api.request("GET", "/admin/customers", { params: { status: customerFilterStatus.value } }).catch(() => null);
      if (res) adminCustomersRaw.value = res.items;
    }
    async function loadAdminCooperatives() {
      adminCooperatives.value = await api.request("GET", "/admin/cooperatives").catch(() => []);
    }
    async function loadAdminReports() {
      const [topSectors, ratingDistribution] = await Promise.all([
        api.request("GET", "/admin/reports/top-sectors").catch(() => []),
        api.request("GET", "/admin/reports/rating-distribution").catch(() => [])
      ]);
      adminReports.value = { topSectors, ratingDistribution };
    }
    async function loadAdminConfig() {
      adminConfig.value = await api.request("GET", "/admin/config").catch(() => adminConfig.value);
    }
    async function loadAdminAuditLogs() {
      const res = await api.request("GET", "/admin/audit-logs").catch(() => null);
      if (res) adminAuditLogs.value = res.items;
    }

    const setAdminTab = (tab) => {
      adminTab.value = tab;
      if (tab === "dashboard") loadAdminDashboard();
      else if (tab === "requests") loadAdminBookings();
      else if (tab === "monitoring") loadAdminDispatchActive();
      else if (tab === "liveWorkers") loadAdminLiveWorkers();
      else if (tab === "workers") loadAdminWorkers();
      else if (tab === "customers") loadAdminCustomers();
      else if (tab === "cooperatives") loadAdminCooperatives();
      else if (tab === "bookings") loadAdminBookingsLedger();
      else if (tab === "reports") loadAdminReports();
      else if (tab === "audit") loadAdminAuditLogs();
      else if (tab === "settings") loadAdminConfig();
    };

    // Real-data admin views, normalized into the field names the existing
    // template already reads (w.availability, w.verification, etc.).
    const AVAIL_DISPLAY = { AVAILABLE: "Available", OFF_DUTY: "Off Duty", ON_JOB: "Busy" };
    const VERIFY_DISPLAY = { APPROVED: "Verified", PENDING: "Pending", REJECTED: "Rejected" };
    const allWorkersList = computed(() =>
      adminWorkersRaw.value.map((w) => ({
        ...w,
        availability: AVAIL_DISPLAY[w.availabilityStatus] || w.availabilityStatus,
        verification: VERIFY_DISPLAY[w.verificationStatus] || w.verificationStatus,
        cooperative: w.cooperativeName,
        rating: w.ratingAverage,
        phone: w.phone
      }))
    );
    const filteredWorkers = computed(() =>
      allWorkersList.value.filter((w) => {
        const matchesSearch = (w.name || "").toLowerCase().includes(workerSearch.value.toLowerCase()) || (w.id || "").toLowerCase().includes(workerSearch.value.toLowerCase());
        const matchesAvailability = !workerFilterAvailability.value || w.availability === workerFilterAvailability.value;
        const matchesCoop = !workerFilterCoop.value || w.cooperative === workerFilterCoop.value;
        return matchesSearch && matchesAvailability && matchesCoop;
      })
    );
    const filteredCustomers = computed(() =>
      adminCustomersRaw.value
        .map((c) => ({ ...c, status: c.accountStatus === "ACTIVE" ? "Active" : c.accountStatus === "SUSPENDED" ? "Suspended" : c.accountStatus }))
        .filter((c) => {
          const matchesSearch = (c.name || "").toLowerCase().includes(customerSearch.value.toLowerCase()) || (c.id || "").toLowerCase().includes(customerSearch.value.toLowerCase());
          const matchesStatus = !customerFilterStatus.value || c.status === customerFilterStatus.value;
          return matchesSearch && matchesStatus;
        })
    );
    const filteredBookings = computed(() =>
      adminBookingsLedger.value.filter((b) => {
        const matchesSearch = (b.id || "").toLowerCase().includes(bookingSearch.value.toLowerCase()) || (b.customerName || "").toLowerCase().includes(bookingSearch.value.toLowerCase()) || (b.workerName || "").toLowerCase().includes(bookingSearch.value.toLowerCase());
        const matchesStatus = !bookingFilterStatus.value || b.status === bookingFilterStatus.value;
        return matchesSearch && matchesStatus;
      })
    );
    const filteredRequests = computed(() =>
      adminBookingsRaw.value.filter((b) => {
        const matchesSearch = (b.id || "").toLowerCase().includes(requestSearch.value.toLowerCase()) || (b.customerName || "").toLowerCase().includes(requestSearch.value.toLowerCase());
        const matchesStatus = !requestFilterStatus.value || b.status === requestFilterStatus.value;
        return matchesSearch && matchesStatus;
      })
    );
    const cooperativeStatsList = computed(() =>
      adminCooperatives.value.map((coop) => {
        const coopWorkers = allWorkersList.value.filter((w) => w.cooperative === coop.name);
        return { ...coop, totalWorkers: coopWorkers.length, availableWorkers: coopWorkers.filter((w) => w.availability === "Available").length, status: "Active" };
      })
    );
    const adminStats = computed(() => {
      const d = adminDashboardRaw.value;
      return {
        totalWorkers: d.totalWorkers,
        availableWorkers: d.availableWorkers,
        busyWorkers: Math.max(d.totalWorkers - d.availableWorkers, 0),
        totalCustomers: d.totalCustomers,
        activeServiceRequests: adminBookingsRaw.value.filter((b) => ["DISPATCHING_TOP3", "DISPATCHING_POOL"].includes(b.status)).length,
        pendingRequests: adminBookingsRaw.value.filter((b) => b.status === "REQUESTED").length,
        activeBookings: d.activeBookings,
        completedBookings: d.completedBookings,
        registeredCooperatives: d.totalCooperatives,
        cooperatives: d.totalCooperatives
      };
    });
    const systemStats = adminStats;
    const adminLiveWorkers = adminLiveWorkersRaw; // exposed under both names for template compatibility
    const liveWorkerStats = adminLiveWorkersRaw;
    const selectedWorkerId = ref(null);
    const liveAdminFilterStatus = ref("All");
    const liveAdminFilterService = ref("All");
    const liveAdminFilterCoop = ref("All");
    const liveAdminFilterJobStatus = ref("All");
    const filteredLiveWorkers = computed(() => adminLiveWorkersRaw.value);
    const selectedLiveWorker = computed(() => adminLiveWorkersRaw.value.find((w) => w.workerId === selectedWorkerId.value) || null);
    const liveStatsTotalWorkers = computed(() => adminLiveWorkersRaw.value.length);
    // GET /admin/live/workers rows: { workerId, name, lat, lng, status, bookingId }
    // where status is the WorkerAvailabilityStatus enum.
    const liveStatsAvailable = computed(() => adminLiveWorkersRaw.value.filter((w) => w.status === "AVAILABLE").length);
    const liveStatsOnJob = computed(() => adminLiveWorkersRaw.value.filter((w) => w.status === "ON_JOB").length);
    const liveStatsTravelling = computed(() => adminLiveWorkersRaw.value.filter((w) => w.status === "TRAVELLING").length);
    const liveStatsOffDuty = computed(() => adminLiveWorkersRaw.value.filter((w) => w.status === "OFF_DUTY").length);
    const liveStatsActiveJobs = computed(() => adminLiveWorkersRaw.value.filter((w) => w.bookingId).length);
    const closeLiveWorkerDrawer = () => (selectedWorkerId.value = null);
    // Map pan/zoom is decorative canvas flavor with no real lat/lng->pixel
    // projection wired server-side; kept static rather than simulated.
    const mapZoom = ref(1);
    const mapCenter = ref({ x: 250, y: 200 });
    const computedViewBox = computed(() => {
      const w = 500 / mapZoom.value, h = 400 / mapZoom.value;
      return `${mapCenter.value.x - w / 2} ${mapCenter.value.y - h / 2} ${w} ${h}`;
    });
    const zoomIn = () => (mapZoom.value = Math.min(mapZoom.value + 0.25, 3));
    const zoomOut = () => (mapZoom.value = Math.max(mapZoom.value - 0.25, 0.5));
    const fitAll = () => {
      selectedWorkerId.value = null;
      mapCenter.value = { x: 250, y: 200 };
      mapZoom.value = 1;
    };
    const focusWorker = (w) => (selectedWorkerId.value = w.workerId || w.id);
    const selectedMapZone = ref(null);
    const selectMapZone = (zone) => (selectedMapZone.value = selectedMapZone.value && selectedMapZone.value.name === zone.name ? null : zone);

    const openRequestDetails = async (request) => {
      selectedRequest.value = { ...request, dispatchLog: await api.request("GET", `/admin/bookings/${request.id}/dispatch-log`).catch(() => []) };
      forceAssignForm.value = { workerId: "", reason: "" };
      forceAssignError.value = "";
    };
    const submitForceAssign = async () => {
      forceAssignError.value = "";
      try {
        await api.request("POST", `/admin/bookings/${selectedRequest.value.id}/force-assign`, { idempotencyKey: api.idempotencyKey(), body: { workerId: forceAssignForm.value.workerId, reason: forceAssignForm.value.reason } });
        selectedRequest.value = null;
        await loadAdminBookings();
      } catch (err) {
        forceAssignError.value = apiErrorMessage(err);
      }
    };
    const submitAdminCancel = async () => {
      await api.request("POST", `/admin/bookings/${selectedRequest.value.id}/cancel`, { body: { reason: adminCancelReason.value } }).catch((err) => (forceAssignError.value = apiErrorMessage(err)));
      selectedRequest.value = null;
      adminCancelReason.value = "";
      await loadAdminBookings();
    };
    const openWorkerDetails = (worker) => {
      selectedWorker.value = worker;
      rejectionReasonInput.value = "";
      suspendReasonInput.value = "";
    };
    const verifyWorker = async (decision) => {
      if (decision === "REJECTED" && !rejectionReasonInput.value.trim()) return;
      await api.request("PATCH", `/admin/workers/${selectedWorker.value.id}/verify`, { body: { decision, rejectionReason: decision === "REJECTED" ? rejectionReasonInput.value : undefined } });
      selectedWorker.value = null;
      await loadAdminWorkers();
    };
    const toggleWorkerSuspension = async (suspended) => {
      if (!suspendReasonInput.value.trim()) return;
      await api.request("PATCH", `/admin/workers/${selectedWorker.value.id}/status`, { body: { suspended, reason: suspendReasonInput.value } });
      selectedWorker.value = null;
      await loadAdminWorkers();
    };
    const openCustomerDetails = (customer) => (selectedCustomer.value = customer);
    const setCustomerStatus = async (accountStatus, reason) => {
      if (!reason || !reason.trim()) return;
      await api.request("PATCH", `/admin/customers/${selectedCustomer.value.id}/status`, { body: { accountStatus, reason } });
      selectedCustomer.value = null;
      await loadAdminCustomers();
    };
    const openCooperativeDetails = async (coop) => {
      selectedCooperative.value = await api.request("GET", `/admin/cooperatives/${coop.id}`).catch(() => coop);
    };
    const createCooperative = async () => {
      await api.request("POST", "/admin/cooperatives", { body: newCooperativeData.value });
      newCooperativeData.value = { name: "", location: "", registrationNumber: "" };
      await loadAdminCooperatives();
    };
    const openBookingDetails = async (booking) => {
      selectedBooking.value = { ...booking, invoice: await api.request("GET", `/admin/bookings/${booking.bookingId}/invoice`).catch(() => null) };
    };
    const closeAdminModals = () => {
      selectedRequest.value = null;
      selectedWorker.value = null;
      selectedCustomer.value = null;
      selectedCooperative.value = null;
      selectedBooking.value = null;
    };
    const openAddService = () => {
      newServiceData.value = { id: "", translationKey: "", baseRate: 200, hourlyRate: 100, icon: "wrench" };
      showAddServiceModal.value = true;
    };
    const openEditService = (svc) => {
      editingServiceData.value = { id: svc.id, baseRate: svc.baseRate, hourlyRate: svc.hourlyRate, isEnabled: svc.isEnabled };
      showEditServiceModal.value = true;
    };
    const addService = async () => {
      await api.request("POST", "/admin/services", { body: newServiceData.value });
      showAddServiceModal.value = false;
      await loadCatalog();
    };
    const editService = async () => {
      await api.request("PATCH", `/admin/services/${editingServiceData.value.id}`, { body: { baseRate: Number(editingServiceData.value.baseRate), hourlyRate: Number(editingServiceData.value.hourlyRate) } });
      showEditServiceModal.value = false;
      await loadCatalog();
    };
    const toggleServiceStatus = async (svc) => {
      await api.request("PATCH", `/admin/services/${svc.id}`, { body: { isEnabled: !svc.isEnabled } });
      await loadCatalog();
    };
    const submitBroadcast = async () => {
      const res = await api.request("POST", "/admin/notifications/broadcast", { body: broadcastForm.value }).catch((err) => {
        broadcastResult.value = apiErrorMessage(err);
        return null;
      });
      if (res) {
        broadcastResult.value = `${res.recipientCount}`;
        broadcastForm.value.title = "";
        broadcastForm.value.body = "";
      }
    };
    const saveAdminConfig = async () => {
      adminConfig.value = await api.request("PATCH", "/admin/config", { body: adminConfig.value });
    };
    const submitWalletAdjustment = async () => {
      walletAdjustmentResult.value = "";
      try {
        const res = await api.request("POST", "/admin/wallet/adjustments", { idempotencyKey: api.idempotencyKey(), body: { workerProfileId: walletAdjustmentForm.value.workerProfileId, amount: Number(walletAdjustmentForm.value.amount), direction: walletAdjustmentForm.value.direction, reason: walletAdjustmentForm.value.reason } });
        walletAdjustmentResult.value = res.status;
      } catch (err) {
        walletAdjustmentResult.value = apiErrorMessage(err);
      }
    };
    const runDemoReset = async () => {
      demoResetBusy.value = true;
      demoResetResult.value = "";
      try {
        await api.request("POST", "/admin/demo/reset");
        demoResetResult.value = "OK";
        await handleLogout();
      } catch (err) {
        demoResetResult.value = apiErrorMessage(err);
      } finally {
        demoResetBusy.value = false;
      }
    };

    // ----------------------------------------------------
    // Translations Helper
    // ----------------------------------------------------
    const t = (key, replacements = {}) => {
      const langTranslations = window.translations[language.value] || window.translations.en;
      let text = langTranslations[key] ?? window.translations.en[key] ?? key;
      Object.keys(replacements).forEach((p) => (text = text.replace(`{${p}}`, replacements[p])));
      return text;
    };
    const getServiceName = (serviceId) => t(serviceId);

    const STAGE_KEY_BY_STATUS = { REQUESTED: "stageCreated", DISPATCHING_TOP3: "stageTop3", DISPATCHING_POOL: "stageWider", ASSIGNED: "stageAssigned", CONFIRMED: "stageAssigned", IN_PROGRESS: "stageProgress", COMPLETED: "stageCompleted", SETTLED: "stageCompleted", CANCELLED: "statusCancelled" };
    const stageLabel = (status) => t(STAGE_KEY_BY_STATUS[status] || status);

    const formatDate = (iso) => (iso ? new Intl.DateTimeFormat(localeTag(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "");
    const formatCurrency = (n) => new Intl.NumberFormat(localeTag(), { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n) || 0);
    function localeTag() {
      return { en: "en-IN", hi: "hi-IN", ta: "ta-IN", bn: "bn-IN" }[language.value] || "en-IN";
    }

    // ----------------------------------------------------
    // Service SVG icon map (visual layer, unchanged from the redesign)
    // ----------------------------------------------------
    const serviceSvgMap = {
      plumbing: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><path d="M4 15h6v4H4z" fill="#93C5FD"/><path d="M4 13.5h2.5v7H4z" fill="#60A5FA"/><path d="M8 15h6a3 3 0 013 3v2h-4v-2a1 1 0 00-1-1H8v-2z" fill="#2563EB"/><rect x="9.5" y="8" width="5" height="2.5" rx="1" fill="#1D4ED8"/><rect x="8" y="7" width="8" height="2" rx="1" fill="#60A5FA"/><circle cx="12" cy="8" r="0.6" fill="#FFFFFF"/><path d="M13 17h4a2 2 0 012 2v2h-3.5a1 1 0 01-1-1v-2a1 1 0 00-1-1h-.5z" fill="#1D4ED8"/><rect x="15.5" y="20.5" width="4" height="1.5" rx="0.75" fill="#60A5FA"/><path d="M17.5 24c0 0-1.8 1.8-1.8 2.8a1.8 1.8 0 003.6 0c0-1-1.8-2.8-1.8-2.8z" fill="#38BDF8"/><circle cx="18" cy="26.3" r="0.4" fill="#FFFFFF"/></svg>`,
      electrical: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><rect x="5" y="16" width="9" height="9" rx="2" fill="#1D4ED8"/><rect x="6.5" y="14" width="6" height="2" rx="0.5" fill="#60A5FA"/><path d="M22 3.5l-7.5 11.5h5.5l-3.5 12.5 11-14.5h-6l4-9.5z" fill="#2563EB"/></svg>`,
      carpentry: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><rect x="4" y="21" width="24" height="6" rx="2" fill="#DBEAFE"/><path d="M16.2 12.8l8.2 11.6a1.5 1.5 0 01-2.5 1.8l-8.2-11.6 2.5-1.8z" fill="#2563EB"/></svg>`,
      painting: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><rect x="6" y="4" width="16" height="5" rx="2" fill="#DBEAFE"/><rect x="16.5" y="19.5" width="3" height="7" rx="1.5" fill="#60A5FA"/></svg>`,
      caregiving: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><path d="M16 8c-2.4-3.3-6.8-2.3-7.8 1.4-.9 3.8 4.3 8 7.8 11 3.4-3 8.7-7.2 7.8-11-.9-3.7-5.4-4.7-7.8-1.4z" fill="#2563EB"/></svg>`,
      gardening: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><path d="M14 26c0-7 2-12 5-15" stroke="#1D4ED8" stroke-width="2.2" stroke-linecap="round"/><path d="M16 19c-4 0-7-2-8-6 4-1 8 1 8 6z" fill="#60A5FA"/></svg>`,
      cleaning: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><path d="M6 13.5L14 6.5l8 7V24a2 2 0 01-2 2H8a2 2 0 01-2-2V13.5z" fill="#DBEAFE"/></svg>`,
      domestichelp: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><path d="M6 21a10 10 0 0120 0H6z" fill="#2563EB"/><circle cx="16" cy="10" r="2" fill="#60A5FA"/></svg>`,
      appliance: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><rect x="5" y="8" width="16" height="18" rx="2" fill="#DBEAFE"/></svg>`,
      ac: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><rect x="4" y="6" width="24" height="11" rx="2" fill="#2563EB"/></svg>`,
      default: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7"><rect x="5" y="10" width="22" height="16" rx="3" fill="#2563EB"/></svg>`
    };
    serviceSvgMap.wrench = serviceSvgMap.plumbing;
    serviceSvgMap.zap = serviceSvgMap.electrical;
    serviceSvgMap.bolt = serviceSvgMap.electrical;
    serviceSvgMap.hammer = serviceSvgMap.carpentry;
    serviceSvgMap["paint-brush"] = serviceSvgMap.painting;
    serviceSvgMap.paintbrush = serviceSvgMap.painting;
    serviceSvgMap.heart = serviceSvgMap.caregiving;
    serviceSvgMap.flower = serviceSvgMap.gardening;
    serviceSvgMap.sparkles = serviceSvgMap.cleaning;
    serviceSvgMap.utensils = serviceSvgMap.domestichelp;
    serviceSvgMap.cooling = serviceSvgMap.ac;
    const getServiceSvg = (serviceId) => {
      if (!serviceId) return serviceSvgMap.default;
      const key = String(serviceId).toLowerCase().replace(/[\s_-]/g, "");
      return serviceSvgMap[key] || serviceSvgMap.default;
    };

    // ----------------------------------------------------
    // Theme / language application
    // ----------------------------------------------------
    const applyThemeClass = () => {
      const root = document.documentElement;
      if (theme.value === "dark") root.classList.add("dark");
      else root.classList.remove("dark");
    };
    const toggleTheme = () => {
      theme.value = theme.value === "light" ? "dark" : "light";
      localStorage.setItem("theme", theme.value);
      applyThemeClass();
    };
    watch(theme, applyThemeClass);
    const changeLanguage = async (lang) => {
      language.value = lang;
      localStorage.setItem("language", lang);
      if (loggedInCustomer.value || loggedInWorker.value || loggedInAdmin.value) {
        await api.request("PATCH", "/users/me/preferences", { body: { language: lang } }).catch(() => {});
      }
    };

    // ----------------------------------------------------
    // Socket.io lifecycle
    // ----------------------------------------------------
    function wireSocketEvents() {
      api.onSocketEvent("connect", () => (socketConnected.value = true));
      api.onSocketEvent("disconnect", () => (socketConnected.value = false));
      api.onSocketEvent("dispatch:update", async (payload) => {
        if (activeBooking.value && payload.bookingId === activeBooking.value.id) await refreshActiveBooking();
        if (currentRole.value === "admin") await Promise.all([loadAdminDispatchActive(), loadAdminBookings()]);
      });
      api.onSocketEvent("dispatch:exhausted", async (payload) => {
        if (activeBooking.value && payload.bookingId === activeBooking.value.id) await refreshActiveBooking();
      });
      api.onSocketEvent("dispatch:offer", async () => {
        if (loggedInWorker.value) await loadWorkerIncoming();
      });
      api.onSocketEvent("notification:new", (n) => notifications.value.unshift(n));
      api.onSocketEvent("worker:location", (payload) => {
        if (currentRole.value === "admin") {
          const idx = adminLiveWorkersRaw.value.findIndex((w) => w.workerId === payload.workerId);
          if (idx !== -1) adminLiveWorkersRaw.value[idx] = { ...adminLiveWorkersRaw.value[idx], ...payload };
        }
      });
    }
    function startSession() {
      api.connectSocket();
      wireSocketEvents();
    }
    function endSession() {
      api.disconnectSocket();
      api.clearAccessToken();
      socketConnected.value = false;
      if (locationPingInterval) {
        clearInterval(locationPingInterval);
        locationPingInterval = null;
      }
    }

    // ----------------------------------------------------
    // Navigation
    // ----------------------------------------------------
    const setRole = (role) => {
      currentRole.value = role;
      loginError.value = "";
      registerError.value = "";
      showPassword.value = false;
      authEmail.value = "";
      authPassword.value = "";
      if (role === "landing") currentView.value = "home";
      else if (role === "customer") currentView.value = loggedInCustomer.value ? "dashboard" : "login";
      else if (role === "worker") currentView.value = loggedInWorker.value ? "dashboard" : "login";
      else if (role === "admin") currentView.value = loggedInAdmin.value ? "dashboard" : "login";
    };
    const navigateTo = (view) => {
      currentView.value = view;
      loginError.value = "";
      showPassword.value = false;
      if (view === "services") {
        requestForm.value.location = loggedInCustomer.value?.address || "";
        requestForm.value.description = "";
        requestForm.value.datetime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
        requestStep.value = 1;
      }
      if (view === "myBookings") loadCustomerBookings();
      if (view === "orders") loadWorkerBookings();
      if (view === "earnings") loadWallet();
      if (view === "incentives") loadIncentives();
      if (view === "map") loadDemandHeatmap();
      if (view === "welfare") loadWelfare();
      if (view === "notifications") loadNotifications();
      if (view === "profile") loadWorkerDocuments();
    };

    // ----------------------------------------------------
    // Authentication (REAL)
    // ----------------------------------------------------
    function normalizeCustomerProfile(profile) {
      return { ...profile, id: profile.customerProfile?.id, name: profile.fullName, address: profile.customerProfile?.defaultAddress || "" };
    }
    function normalizeWorkerProfile(profile) {
      const wp = profile.workerProfile || {};
      return {
        ...profile,
        id: wp.id,
        name: profile.fullName,
        cooperative: wp.cooperativeName,
        rating: wp.ratingAverage,
        availabilityStatus: wp.availabilityStatus,
        verificationStatus: wp.verificationStatus,
        status: wp.availabilityStatus === "AVAILABLE" ? "Available" : "Off Duty",
        availability: wp.availabilityStatus === "AVAILABLE" ? "Available" : "Off Duty",
        verification: VERIFY_DISPLAY[wp.verificationStatus] || wp.verificationStatus,
        skill: authSkill.value || null
      };
    }
    function normalizeAdminProfile(profile) {
      return { ...profile, name: profile.fullName, isSuper: !!profile.adminProfile?.isSuper };
    }
    async function loadOwnProfile(role) {
      const profile = await api.request("GET", "/users/me");
      if (role === "CUSTOMER") loggedInCustomer.value = normalizeCustomerProfile(profile);
      else if (role === "WORKER") loggedInWorker.value = normalizeWorkerProfile(profile);
      else if (role === "ADMIN") loggedInAdmin.value = normalizeAdminProfile(profile);
      return profile;
    }

    const handleLogin = async () => {
      if (authBusy.value) return;
      loginError.value = "";
      authBusy.value = true;
      try {
        const rolePath = currentRole.value === "customer" ? "customer" : currentRole.value === "worker" ? "worker" : "admin";
        const res = await api.request("POST", `/auth/${rolePath}/login`, { body: { identifier: authEmail.value.trim(), password: authPassword.value } });
        api.setAccessToken(res.token);
        startSession();
        await Promise.all([loadOwnProfile(res.role), services.value.length === 0 ? loadCatalog() : Promise.resolve()]);
        currentView.value = "dashboard";
        authEmail.value = "";
        authPassword.value = "";
        addDemoLog(`${currentRole.value} logged in.`);
        // Dashboard data (bookings, wallet, admin summary...) streams in after
        // the view switches; awaiting it here kept the user on the login screen
        // for several extra sequential round-trips.
        initializeRoleData(currentRole.value).catch(() => {});
      } catch (err) {
        loginError.value = apiErrorMessage(err);
      } finally {
        authBusy.value = false;
      }
    };

    const handleRegister = async () => {
      if (authBusy.value) return;
      registerError.value = "";
      authBusy.value = true;
      try {
        if (currentRole.value === "customer") {
          const { lat, lng } = await getCoordinates();
          const res = await api.request("POST", "/auth/customer/register", { body: { fullName: authName.value, email: authEmail.value.trim(), phone: authPhone.value.trim(), password: authPassword.value, address: authAddress.value, lat, lng, acceptedTerms: true } });
          api.setAccessToken(res.token);
          startSession();
          await loadOwnProfile("CUSTOMER");
          await loadCatalog();
          currentView.value = "dashboard";
          await initializeRoleData("customer");
        } else if (currentRole.value === "worker") {
          const { lat, lng } = await getCoordinates();
          const res = await api.request("POST", "/auth/worker/register", { body: { fullName: authName.value, email: authEmail.value.trim(), phone: authPhone.value.trim(), password: authPassword.value, cooperativeId: authCoop.value, primarySkillId: authSkill.value, experienceYears: Number(authExperience.value) || 0, homeLocation: { lat, lng, address: authAddress.value }, serviceAreaRadiusKm: Number(authServiceRadiusKm.value) || 5, acceptedTerms: true } });
          api.setAccessToken(res.token);
          startSession();
          await loadOwnProfile("WORKER");
          currentView.value = "dashboard";
          await initializeRoleData("worker");
        }
      } catch (err) {
        registerError.value = apiErrorMessage(err);
      } finally {
        authName.value = "";
        authEmail.value = "";
        authPhone.value = "";
        authPassword.value = "";
        authAddress.value = "";
        authCoop.value = "";
        authExperience.value = "";
        authBusy.value = false;
      }
    };

    const handleLogout = () => {
      endSession();
      loggedInCustomer.value = null;
      loggedInWorker.value = null;
      loggedInAdmin.value = null;
      activeBookingId.value = null;
      activeBooking.value = null;
      currentRole.value = "landing";
      currentView.value = "home";
      api.request("POST", "/auth/logout").catch(() => {});
    };

    watch([currentRole, currentView], ([newRole, newView]) => {
      const publicViews = ["login", "register"];
      if (newRole === "customer" && !loggedInCustomer.value && !publicViews.includes(newView)) currentView.value = "login";
      else if (newRole === "worker" && !loggedInWorker.value && !publicViews.includes(newView)) currentView.value = "login";
      else if (newRole === "admin" && !loggedInAdmin.value && newView !== "login") currentView.value = "login";
    });

    async function initializeRoleData(role) {
      if (role === "landing") {
        setupLandingStatsObserver();
      } else if (role === "customer" && loggedInCustomer.value) {
        await Promise.all([loadCustomerBookings(), refreshActiveBooking()]);
      } else if (role === "worker" && loggedInWorker.value) {
        await Promise.all([loadWorkerIncoming(), loadWorkerActiveJob(), loadWallet(), loadDemandHeatmap()]);
        if (loggedInWorker.value.availabilityStatus === "AVAILABLE") startLocationPinging();
      } else if (role === "admin" && loggedInAdmin.value) {
        setAdminTab("dashboard");
      }
    }
    watch(currentRole, initializeRoleData);

    // ----------------------------------------------------
    // Landing page stats animation (real data)
    // ----------------------------------------------------
    const animatedWorkers = ref(0);
    const animatedDispatched = ref(0);
    const animatedCooperatives = ref(0);
    const statsAnimationCompleted = ref(false);
    const hasAnimatedOnce = ref(false);
    const triggerStatsAnimation = () => {
      const targetWorkers = platformStats.value.totalWorkers;
      const targetDispatched = platformStats.value.completedBookings;
      const targetCooperatives = platformStats.value.activeCooperatives;
      const duration = 1800;
      const startTime = performance.now();
      const startW = animatedWorkers.value, startD = animatedDispatched.value, startC = animatedCooperatives.value;
      statsAnimationCompleted.value = false;
      const animateStep = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = progress * (2 - progress);
        animatedWorkers.value = Math.floor(startW + (targetWorkers - startW) * ease);
        animatedDispatched.value = Math.floor(startD + (targetDispatched - startD) * ease);
        animatedCooperatives.value = Math.floor(startC + (targetCooperatives - startC) * ease);
        if (progress < 1) requestAnimationFrame(animateStep);
        else {
          animatedWorkers.value = targetWorkers;
          animatedDispatched.value = targetDispatched;
          animatedCooperatives.value = targetCooperatives;
          statsAnimationCompleted.value = true;
          hasAnimatedOnce.value = true;
        }
      };
      requestAnimationFrame(animateStep);
    };
    watch(() => [platformStats.value.totalWorkers, platformStats.value.completedBookings, platformStats.value.activeCooperatives], () => {
      if (hasAnimatedOnce.value) triggerStatsAnimation();
    });
    let landingStatsObserver = null, landingStatsTimeout1 = null, landingStatsTimeout2 = null;
    const setupLandingStatsObserver = () => {
      if (landingStatsObserver) {
        landingStatsObserver.disconnect();
        landingStatsObserver = null;
      }
      if (landingStatsTimeout1) clearTimeout(landingStatsTimeout1);
      if (landingStatsTimeout2) clearTimeout(landingStatsTimeout2);
      landingStatsTimeout1 = setTimeout(() => {
        const statsEl = document.getElementById("landing-stats");
        if (statsEl) {
          animatedWorkers.value = 0;
          animatedDispatched.value = 0;
          animatedCooperatives.value = 0;
          statsAnimationCompleted.value = false;
          hasAnimatedOnce.value = false;
          landingStatsObserver = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && triggerStatsAnimation()), { threshold: 0.15 });
          landingStatsObserver.observe(statsEl);
        }
        landingStatsTimeout2 = setTimeout(() => {
          if (!hasAnimatedOnce.value) triggerStatsAnimation();
        }, 1500);
      }, 150);
    };

    // ----------------------------------------------------
    // Lifecycle
    // ----------------------------------------------------
    onMounted(async () => {
      applyThemeClass();
      const appEl = document.getElementById("app");
      if (appEl) appEl.removeAttribute("v-cloak");

      await loadPlatformStats();
      await loadCatalog();

      try {
        const token = await api.refreshSession();
        api.setAccessToken(token);
        const profile = await api.request("GET", "/users/me");
        startSession();
        if (profile.role === "CUSTOMER") {
          loggedInCustomer.value = normalizeCustomerProfile(profile);
          currentRole.value = "customer";
        } else if (profile.role === "WORKER") {
          loggedInWorker.value = normalizeWorkerProfile(profile);
          currentRole.value = "worker";
        } else {
          loggedInAdmin.value = normalizeAdminProfile(profile);
          currentRole.value = "admin";
        }
        currentView.value = "dashboard";
        await initializeRoleData(currentRole.value);
      } catch {
        currentRole.value = "landing";
        currentView.value = "home";
      }

      api.onExpired(() => {
        endSession();
        loggedInCustomer.value = null;
        loggedInWorker.value = null;
        loggedInAdmin.value = null;
        activeBookingId.value = null;
        activeBooking.value = null;
        currentRole.value = "landing";
        currentView.value = "home";
      });

      setupLandingStatsObserver();

      window.addEventListener("scroll", () => {
        const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
        const progressBar = document.getElementById("scrollProgressBar");
        if (progressBar) progressBar.style.width = scrolled + "%";
        document.querySelectorAll(".parallax-bg").forEach((el) => (el.style.transform = `translateY(${winScroll * 0.15}px)`));
      });

      let scrollRevealObserver = null;
      const setupScrollReveal = () => {
        if (typeof IntersectionObserver === "undefined") return;
        if (scrollRevealObserver) {
          scrollRevealObserver.disconnect();
          scrollRevealObserver = null;
        }
        scrollRevealObserver = new IntersectionObserver(
          (entries) => entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              entry.target.querySelectorAll(".stagger-item").forEach((child, i) => setTimeout(() => child.classList.add("is-visible"), i * 80));
            }
          }),
          { threshold: 0.05 }
        );
        document.querySelectorAll(".scroll-reveal").forEach((el) => scrollRevealObserver.observe(el));
      };
      setTimeout(setupScrollReveal, 100);

      watch([currentRole, currentView, adminTab], () => {
        setTimeout(setupScrollReveal, 150);
        setTimeout(() => {
          document.querySelectorAll("main .space-y-6, main .space-y-8, main .max-w-2xl, main .max-w-5xl").forEach((el) => {
            el.classList.remove("tab-content-transition");
            void el.offsetWidth;
            el.classList.add("tab-content-transition");
          });
        }, 50);
      });

      document.addEventListener("mousedown", (e) => {
        const btn = e.target.closest("button, .btn-interactive");
        if (!btn) return;
        btn.classList.add("ripple-container");
        const circle = document.createElement("span");
        const diameter = Math.max(btn.clientWidth, btn.clientHeight);
        const radius = diameter / 2;
        circle.style.width = circle.style.height = `${diameter}px`;
        const rect = btn.getBoundingClientRect();
        circle.style.left = `${e.clientX - rect.left - radius}px`;
        circle.style.top = `${e.clientY - rect.top - radius}px`;
        circle.classList.add("ripple");
        const prev = btn.querySelector(".ripple");
        if (prev) prev.remove();
        btn.appendChild(circle);
      });
    });

    onUnmounted(() => {
      if (locationPingInterval) clearInterval(locationPingInterval);
      if (candidatePollInterval) clearInterval(candidatePollInterval);
    });

    return {
      theme, language, currentRole, currentView, t, getServiceName, getServiceSvg, stageLabel, formatDate, formatCurrency,
      toggleTheme, changeLanguage, setRole, navigateTo, socketConnected, authBusy,
      currentActiveUser, loggedInCustomer, loggedInWorker, loggedInAdmin, loginError, registerError, showPassword,
      authEmail, authPassword, authName, authPhone, authAddress, authCoop, authSkill, authExperience, authServiceRadiusKm,
      handleLogin, handleRegister, handleLogout,
      services, cooperatives, platformStats, bookings, customerBookings, activeBookingId, activeBooking, activeWorkerJob, workerJobHistory,
      dispatchCandidates, requestForm, ratingModal, paymentGatewayModal, paymentMethodError,
      selectService, handleRequestSubmit, viewBooking, cancelBooking, completeJob, submitRating, openPaymentMethod, choosePaymentMethod,
      workerBookings, workerIncoming, workerActiveJob, walletInfo, incentivesList, welfareInfo, demandHeatmap,
      redemptionAmount, redemptionError, redemptionSuccess, redemptionHistory, payoutMethod, earningsTab, earningsFilterService, earningsFilterType, earningsFilterDate, showFilterDrawer,
      selectedOrder, selectedIncentive, workerDocuments, documentUploadError, documentUploadSuccess,
      toggleAvailability, handleWorkerAccept, handleWorkerReject, workerOnTheWay, workerStartJob, workerCompleteJob, handleRedeem, uploadDocument,
      workerIncomingRequests, isWorkerAccepting, isWorkerDeclining, demoWorkerRequests, acceptDemoRequest, rejectDemoRequest,
      simulateWorkerAcceptancePathA, simulatePoolWorkerAcceptance, liveStatsTravelling, liveStatsOffDuty, liveStatsActiveJobs,
      notifications, adminNotifications, userNotifications, unreadUserNotificationsCount, markNotificationRead, markAllNotificationsRead, markAllUserNotificationsRead,
      isNotificationDropdownOpen, isProfileMenuOpen, toggleNotifications, toggleProfileMenu, closeHeaderDropdowns,
      adminTab, setAdminTab, adminIsSuper, adminDashboard: adminDashboardRaw, adminBookings: adminBookingsRaw, adminBookingsLedger, adminDispatchActive,
      adminLiveWorkers, liveWorkerStats, adminWorkers: adminWorkersRaw, adminCustomers: adminCustomersRaw, adminCooperatives, adminAuditLogs, adminReports, adminConfig,
      selectedRequest, selectedWorker, selectedCustomer, selectedCooperative, selectedBooking,
      workerSearch, workerFilterSkill, workerFilterAvailability, workerFilterCoop, workerFilterVerification,
      customerSearch, customerFilterStatus, requestSearch, requestFilterStatus, bookingSearch, bookingFilterStatus,
      filteredWorkers, filteredCustomers, filteredBookings, filteredRequests, allWorkersList, adminStats, systemStats, cooperativeStatsList,
      loadAdminBookings, loadAdminWorkers, loadAdminCustomers, loadAdminBookingsLedger,
      showAddServiceModal, showEditServiceModal, newServiceData, editingServiceData,
      forceAssignForm, forceAssignError, adminCancelReason, rejectionReasonInput, suspendReasonInput,
      broadcastForm, broadcastResult, newCooperativeData, walletAdjustmentForm, walletAdjustmentResult, demoResetBusy, demoResetResult,
      openRequestDetails, submitForceAssign, submitAdminCancel, openWorkerDetails, verifyWorker, toggleWorkerSuspension,
      openCustomerDetails, setCustomerStatus, openCooperativeDetails, createCooperative, openBookingDetails, closeAdminModals,
      openAddService, openEditService, addService, editService, toggleServiceStatus, submitBroadcast, saveAdminConfig, submitWalletAdjustment, runDemoReset,
      animatedWorkers, animatedDispatched, animatedCooperatives, statsAnimationCompleted, triggerStatsAnimation,

      // Toasts
      toasts, showToast, dismissToast,

      // Service search / preview / recents
      serviceSearchQuery, selectedServiceCategory, serviceCategories, serviceDescriptions, getServiceDescription,
      filteredServices, previewService, openServicePreview, closeServicePreview, recentServices, selectRecentService,
      useCurrentLocation, setQuickDatePreset, isSubmittingRequest,

      // Dispatch cascade display (real-data-backed)
      cascadeStep, cascadeStatusMessage, simulateCascadeNextStep, resetMatchingTimer, demoLogs,
      matchingPhase, matchingTimer, matchingTopWorkers, matchingWiderPool,

      // Multi-step wizard
      requestStep, goToRequestStep, nextRequestStep, prevRequestStep, canContinueRequestStep,

      // Matching interactions
      isMatchingSearching, expandedWorkerId, selectedMatchingWorkerId, toggleExpandWorker, selectMatchingWorker,

      // Live map (decorative)
      selectedWorkerId, liveAdminFilterStatus, liveAdminFilterService, liveAdminFilterCoop, liveAdminFilterJobStatus,
      mapZoom, mapCenter, computedViewBox, selectedLiveWorker, filteredLiveWorkers,
      liveStatsTotalWorkers, liveStatsAvailable, liveStatsOnJob, zoomIn, zoomOut, fitAll, focusWorker, closeLiveWorkerDrawer,
      selectedMapZone, selectMapZone
    };
  }
});

app.component("animated-number", {
  props: {
    value: { type: [Number, String], required: true },
    duration: { type: Number, default: 1500 },
    formatCurrency: { type: Boolean, default: false },
    formatPercent: { type: Boolean, default: false }
  },
  setup(props) {
    const displayValue = ref("0");
    const elementRef = ref(null);
    let observer = null;
    let hasAnimated = false;
    let animationFrameId = null;

    const getNumericValue = (val) => {
      if (typeof val === "number") return val;
      const clean = String(val).replace(/[^0-9.-]/g, "");
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    };
    const formatValue = (num) => {
      const originalStr = String(props.value);
      const hasCurrencySymbol = originalStr.includes("₹") || props.formatCurrency;
      const hasPercentSymbol = originalStr.includes("%") || props.formatPercent;
      const hasStar = originalStr.includes("★") || originalStr.includes("⭐");
      const hasKm = originalStr.includes("km");
      const hasHrs = originalStr.includes("hrs");
      let formatted = num;
      if (originalStr.includes(".") || hasStar || hasKm) formatted = num.toFixed(1);
      else formatted = Math.floor(num);
      if (Math.abs(formatted) >= 1000) formatted = Number(formatted).toLocaleString("en-IN");
      if (hasCurrencySymbol) formatted = "₹" + formatted;
      if (hasPercentSymbol) formatted = formatted + "%";
      if (hasStar) formatted = formatted + (originalStr.includes("★") ? " ★" : " ⭐");
      if (hasKm) formatted = formatted + " km";
      if (hasHrs) formatted = formatted + " hrs";
      return formatted;
    };
    const triggerAnimation = (newVal, oldVal = 0) => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      const target = getNumericValue(newVal);
      const start = getNumericValue(oldVal);
      const startTime = performance.now();
      const animateStep = (now) => {
        const progress = Math.min((now - startTime) / props.duration, 1);
        const ease = progress * (2 - progress);
        displayValue.value = formatValue(start + (target - start) * ease);
        if (progress < 1) animationFrameId = requestAnimationFrame(animateStep);
        else {
          displayValue.value = formatValue(target);
          hasAnimated = true;
        }
      };
      animationFrameId = requestAnimationFrame(animateStep);
    };
    watch(() => props.value, (newVal, oldVal) => {
      if (hasAnimated) triggerAnimation(newVal, oldVal);
      else displayValue.value = formatValue(0);
    });
    onMounted(() => {
      displayValue.value = formatValue(0);
      if (elementRef.value && typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && !hasAnimated && triggerAnimation(props.value, 0)), { threshold: 0.05 });
        observer.observe(elementRef.value);
      } else {
        triggerAnimation(props.value, 0);
      }
    });
    onUnmounted(() => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (observer) observer.disconnect();
    });
    return { displayValue, elementRef };
  },
  template: `<span ref="elementRef">{{ displayValue }}</span>`
});

app.mount("#app");
