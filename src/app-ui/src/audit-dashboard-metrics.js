/**
 * Flat EDS-style metrics: keys like "summary.totalChecks", "metadata.projectName".
 * Groups by first path segment (category) and helpers for the dashboard.
 *
 * DEFAULT_AUDIT_METRICS — starting sample when no MCP/query payload is present.
 * Keep in sync with src/default-audit-metrics.json (used by the MCP server).
 *
 * CATEGORY_ORDER — card sort order; first segment of each key in DEFAULT_AUDIT_METRICS (legacy-only
 * categories such as overallScores / domains still appear when present in a payload, sorted after these).
 */
  var CATEGORY_ORDER = [
    "metadata",
    "summary",
    "scores",
    "status",
    "risk",
    "trend",
    "topIssues",
    "components",
  ];

  var DEFAULT_AUDIT_METRICS = Object.freeze({
    "metadata.projectName": "Experience League",
    "metadata.repoUrl": "https://github.com/adobe-experience-league/exlm.git",
    "metadata.appUrl": "https://experienceleague.adobe.com",
    "metadata.auditDate": "2026-03-24T17:13:11Z",
    "metadata.auditorName": "Noor",
    "metadata.auditVersion": "2.0.0",
    "metadata.projectType": "Enhancement",
    "metadata.projectManager": "Alex Morgan",
    "metadata.architectLead": "Jordan Lee",
    "metadata.currentPhase": "Development",
    "summary.browserAudit.total": "47",
    "summary.browserAudit.passed": "17",
    "summary.browserAudit.failed": "30",
    "summary.browserAudit.notApplicable": "0",
    "summary.codeAudit.total": "143",
    "summary.codeAudit.passed": "49",
    "summary.codeAudit.failed": "94",
    "summary.codeAudit.notApplicable": "0",
    "summary.manualAudit.total": "64",
    "summary.manualAudit.passed": "64",
    "summary.manualAudit.failed": "0",
    "summary.manualAudit.notApplicable": "0",
    "summary.overall.total": "254",
    "summary.overall.passed": "130",
    "summary.overall.failed": "124",
    "summary.overall.notApplicable": "0",
    "summary.overall.mandatoryFailed": "106",
    "summary.overall.criticalFailed": "32",
    "summary.overall.highFailed": "59",
    "summary.overall.mediumFailed": "33",
    "scores.overall": "63.7",
    "scores.discovery": "100.0",
    "scores.contentQuality": "100.0",
    "scores.internationalization": "100.0",
    "scores.design": "100.0",
    "scores.userExperience": "100.0",
    "scores.visualDesign": "100.0",
    "scores.setup": "100.0",
    "scores.development": "33.6",
    "scores.architectureReview": "100.0",
    "scores.testing": "100.0",
    "scores.security": "44.4",
    "scores.performance": "47.4",
    "scores.accessibility": "35.7",
    "scores.authorValidation": "100.0",
    "scores.preGoLive": "100.0",
    "scores.postGoLive": "100.0",
    "scores.processGovernance": "90.0",
    "browser.accessibility.skipLinksImplemented": "0",
    "browser.accessibility.lighthouseAccessibilityScore": "96",
    "browser.accessibility.wcagViolationsCritical": "",
    "browser.accessibility.wcagViolationsTotal": "",
    "browser.security.inlineScriptsWithoutNonce": "0",
    "browser.security.formActionsUseHttps": "1",
    "browser.security.cspHeaderPresent": "0",
    "browser.security.cspHasUnsafeDirectives": "1",
    "browser.security.xContentTypeOptionsPresent": "0",
    "browser.security.xFrameOptionsOrCspFrameAncestors": "0",
    "browser.security.referrerPolicyPresent": "0",
    "browser.security.zeroJsErrorsInConsole": "0",
    "browser.security.noDeprecatedApiWarnings": "0",
    "browser.security.mixedContentDetected": "0",
    "browser.security.tlsCertificateValid": "1",
    "browser.security.sensitiveDataInClientStorage": "1",
    "browser.security.cookieSameSiteSecureFlags": "0",
    "browser.security.websocketUsesWss": "1",
    "browser.security.noCspViolationsInConsole": "0",
    "browser.performance.lazyLoadingBelowFold": "0",
    "browser.performance.cssDeliveryOptimized": "1",
    "browser.performance.unusedJsRemoved": "0",
    "browser.performance.webfontUsesWoff2": "0",
    "browser.performance.lighthousePerformanceScore": "",
    "browser.performance.lcpMs": "332",
    "browser.performance.clsScore": "0.05",
    "browser.performance.inpMs": "72",
    "browser.performance.longTasksOnMainThread": "1",
    "browser.performance.tbtWithinBudget": "0",
    "browser.performance.ttfbMs": "2",
    "browser.performance.lighthouseSeoScore": "83",
    "browser.performance.lighthouseBestPracticesScore": "100",
    "browser.performance.totalPageWeightKb": "674",
    "browser.performance.compressionEnabled": "1",
    "browser.performance.imageOptimizationIssues": "0",
    "browser.performance.resourcesOverHttp2OrHttp3": "1",
    "browser.performance.unusedJsCssPercent": "",
    "browser.performance.fcpMs": "",
    "browser.performance.speedIndexMs": "",
    "browser.performance.duplicateNetworkRequests": "1",
    "browser.development.metaDescriptionPresent": "0",
    "browser.development.metaDescriptionLength": "198",
    "browser.development.faviconPresent": "0",
    "browser.development.canonicalUrlPresent": "1",
    "browser.development.hreflangImplemented": "0",
    "browser.development.cssBeforeScriptsInHead": "0",
    "browser.development.externalLinksHaveNoopener": "0",
    "browser.development.customErrorPagesExist": "1",
    "browser.development.responsiveAtAllBreakpoints": "1",
    "browser.development.clsInPerformancePanel": "1",
    "browser.development.noRenderBlockingResources": "0",
    "browser.development.noConsoleLogInProduction": "0",
    "browser.development.noViolationMessagesInConsole": "1",
    "browser.development.noForcedSyncLayoutsInFlameChart": "0",
    "browser.development.noExcessiveRepaintsOnScroll": "0",
    "browser.development.noDetachedDomNodes": "0",
    "browser.development.preloadedResourcesConsumed": "1",
    "browser.development.webFontsLoadWithoutFoit": "1",
    "code.html.semantics.semanticToDivRatioPass": "0",
    "code.html.semantics.headingHierarchyCorrect": "0",
    "code.html.semantics.singleH1PerPage": "1",
    "code.html.structure.domSourceOrderMatchesTabOrder": "0",
    "code.html.structure.criticalContentInRawHtml": "0",
    "code.html.structure.excessiveDomDepth": "1",
    "code.html.forms.radioCheckboxHaveFieldsetLegend": "0",
    "code.html.forms.allInputsHaveLabels": "0",
    "code.html.forms.missingLabelsCount": "",
    "code.html.forms.placeholderUsedAsLabel": "1",
    "code.html.forms.errorMessagesLinkedToInputs": "0",
    "code.html.forms.interactiveElementsHaveAccessibleNames": "0",
    "code.html.forms.inlineStylesCount": "",
    "code.html.media.decorativeImagesHaveEmptyAlt": "0",
    "code.html.media.altTextQualityPass": "0",
    "code.html.media.missingOrInvalidAltCount": "",
    "code.html.media.tablesHaveTheadTbody": "1",
    "code.html.media.tableHeadersUseTh": "1",
    "code.html.media.listsUseUlOrOlCorrectly": "0",
    "code.html.media.imgElementsHaveDimensionsForCls": "0",
    "code.html.metadata.pageTitlePresent": "0",
    "code.html.metadata.pageTitleQualityPass": "0",
    "code.html.metadata.metaViewportConfigured": "1",
    "code.html.metadata.charsetDeclaredInHead": "1",
    "code.html.metadata.langAttributeValid": "1",
    "code.html.metadata.dirAttributeForRtl": "0",
    "code.html.metadata.duplicateIdsCount": "",
    "code.html.metadata.invalidHtmlNestingCount": "",
    "code.html.metadata.htmlValidationErrorCount": "",
    "code.html.metadata.ariaRolesDontDuplicateSemantics": "0",
    "code.html.metadata.noAriaMisuse": "0",
    "code.html.metadata.ariaUsedOnlyWhenNecessary": "0",
    "code.html.metadata.metaTagsDoNotBlockZoom": "1",
    "code.html.metadata.brokenLinksCount": "",
    "code.css.tokens.cssVarsUsedForColors": "0",
    "code.css.tokens.cssVarsUsedForSpacing": "0",
    "code.css.tokens.cssVarsUsedForTypography": "0",
    "code.css.tokens.cssVarsUsedForFontFamily": "0",
    "code.css.tokens.hardcodedHexOrRgbCount": "",
    "code.css.tokens.hardcodedPixelSpacingCount": "",
    "code.css.maintainability.namingConventionsConsistent": "1",
    "code.css.maintainability.classNamesAvoidColorOrPosition": "1",
    "code.css.maintainability.selectorsColocatedInSameFile": "1",
    "code.css.maintainability.printStylesheetHidesNonEssential": "",
    "code.css.layout.modernLayoutUsed": "0",
    "code.css.layout.mobileFirstMediaQueries": "1",
    "code.css.layout.standardBreakpointsOnly": "0",
    "code.css.layout.responsiveImagesByDefault": "1",
    "code.css.layout.zIndexEscalationIssues": "1",
    "code.css.performance.noExpensiveBoxShadows": "0",
    "code.css.performance.noHeavyCssFilters": "0",
    "code.css.performance.noInfiniteAnimationsOnNonLoaders": "0",
    "code.css.performance.cssCompatibilityIssuesCount": "",
    "code.css.performance.vendorPrefixIssues": "0",
    "code.css.quality.duplicateCssRulesCount": "",
    "code.css.quality.unusedCssSelectorsCount": "",
    "code.css.quality.propertyOrderingConsistent": "0",
    "code.javascript.loading.noBlockingScriptsInHead": "1",
    "code.javascript.loading.asyncOrDeferUsed": "1",
    "code.javascript.loading.thirdPartyScriptsLazyLoaded": "1",
    "code.javascript.loading.noUnusedModulesLoaded": "0",
    "code.javascript.loading.noMarketingTagsInHead": "1",
    "code.javascript.loading.userFacingStringsUseI18nKeys": "0",
    "code.javascript.loading.noBinariesInRepo": "1",
    "code.javascript.loading.errorMessagesFollowPattern": "0",
    "code.javascript.dom.noTightDomCoupling": "0",
    "code.javascript.dom.noForcedSyncLayoutsInCode": "0",
    "code.javascript.dom.timerLeaksCount": "124",
    "code.javascript.dom.pollingWithoutObserverCount": "",
    "code.javascript.dom.prefersNativeBrowserApis": "1",
    "code.javascript.dom.modernEs6SyntaxUsed": "1",
    "code.javascript.state.noMemoryLeakRisks": "0",
    "code.javascript.state.eventListenersCleanedUp": "0",
    "code.javascript.state.asyncAwaitUsed": "1",
    "code.javascript.state.promisesHandledCorrectly": "0",
    "code.javascript.state.stateMutationThroughSetters": "0",
    "code.javascript.state.noSharedStateMutation": "0",
    "code.javascript.state.noSideEffectsInPureFunctions": "0",
    "code.javascript.state.consistentReturnTypes": "0",
    "code.javascript.state.noStateMutationInLoops": "1",
    "code.javascript.structure.globalVariablesCount": "",
    "code.javascript.structure.jsScopedToComponent": "1",
    "code.javascript.structure.codingStyleConsistent": "1",
    "code.javascript.structure.deeplyNestedCallbacksCount": "",
    "code.javascript.structure.callChainDepthWithinLimit": "0",
    "code.javascript.structure.inputValidationPresent": "0",
    "code.javascript.structure.noUnreachableCode": "1",
    "code.javascript.structure.noEmptyCatchBlocks": "1",
    "code.javascript.structure.noUnusedNpmPackages": "0",
    "code.javascript.structure.noUnusedComponentProps": "1",
    "code.accessibility.wcag.wcag21AAComplianceMet": "0",
    "code.accessibility.wcag.dynamicContentChangesAnnounced": "0",
    "code.accessibility.components.modalDialogAriaCorrect": "0",
    "code.accessibility.components.videoCaptionsPresent": "0",
    "code.accessibility.components.audioTranscriptsPresent": "0",
    "code.accessibility.components.noFocusTrapMisuse": "1",
    "code.accessibility.css.visibleFocusStylesPresent": "0",
    "code.accessibility.css.hoverRulesHaveFocusEquivalent": "0",
    "code.accessibility.css.visuallyHiddenPatternCorrect": "1",
    "code.security.clientCode.noEvalOrFunctionString": "1",
    "code.security.clientCode.noDocumentWrite": "1",
    "code.security.clientCode.externalScriptsHaveSri": "0",
    "code.security.clientCode.noUnsanitizedInnerHtml": "0",
    "code.security.secrets.noHardcodedApiKeys": "1",
    "code.security.secrets.noCredentialsInUrls": "1",
    "code.security.secrets.noSensitiveDataInComments": "0",
    "code.security.secrets.noInsecureStorageForSecrets": "0",
    "code.security.secrets.noPiiInStorageWithoutConsent": "0",
    "code.security.dependencies.noKnownVulnerableDependencies": "0",
    "code.security.input.noSensitiveDataInClientVisibleAttributes": "0",
    "code.quality.hygiene.lintErrorsCount": "0",
    "code.quality.hygiene.unusedVariablesCount": "0",
    "code.quality.hygiene.unusedFunctionsCount": "0",
    "code.quality.hygiene.unusedImportsCount": "0",
    "code.quality.hygiene.deadCodePathsCount": "",
    "code.quality.hygiene.deadCodeFilesCount": "",
    "code.quality.hygiene.commentedOutCodeCount": "",
    "code.quality.hygiene.implicitGlobalsCount": "0",
    "code.quality.hygiene.fileStructureConsistent": "1",
    "code.quality.hygiene.duplicateConstantsCount": "",
    "code.quality.readability.variableNamingViolationsCount": "",
    "code.quality.readability.functionNamingViolationsCount": "",
    "code.quality.readability.namingConventionsConsistent": "1",
    "code.quality.readability.complexConditionsCount": "",
    "code.quality.readability.missingGuardClausesCount": "",
    "code.quality.readability.oversizedFilesOrFunctionsCount": "1755",
    "code.quality.readability.singleResponsibilityViolationsCount": "",
    "code.quality.readability.readmePresent": "1",
    "code.quality.reliability.inconsistentErrorHandlingCount": "",
    "code.quality.reliability.poorErrorLoggingCount": "",
    "code.quality.reliability.ungracefulErrorsCount": "",
    "code.quality.reliability.magicNumbersCount": "",
    "code.quality.reliability.uncentralizedConstantsCount": "",
    "code.quality.reliability.hardcodedBehaviorCount": "0",
    "code.quality.reliability.duplicatedUtilitiesCount": "0",
    "code.quality.reliability.duplicateCodePercent": "",
    "code.quality.architecture.hardcodedEnvValuesCount": "",
    "code.quality.architecture.circularDependenciesCount": "",
    "code.quality.architecture.staleTodoFixmeCount": "",
    "code.governance.vcs.gitRepositoryInitialized": "1",
    "code.governance.vcs.gitignorePresent": "1",
    "code.governance.vcs.lockfileCommitted": "1",
    "code.governance.quality.preCommitHooksConfigured": "1",
    "code.governance.config.nodeVersionSpecified": "1",
    "code.governance.genai.noMockDataInProduction": "0",
    "manual.discovery.businessObjectivesAndKpisDefined": "1",
    "manual.discovery.targetAudienceAndPersonasDefined": "1",
    "manual.discovery.cdnProviderAndRepoIdentified": "1",
    "manual.discovery.edsAuthoringAndContentRequirementsDefined": "1",
    "manual.discovery.edsBlockRequirementsAndStructureDefined": "1",
    "manual.discovery.integrationAndMarTechRequirementsDefined": "1",
    "manual.discovery.nonFunctionalRequirementsDefined": "1",
    "manual.discovery.seoRoutingAndLocalizationDefined": "1",
    "manual.design.hldDocumented": "1",
    "manual.design.blockAndFragmentDesignComplete": "1",
    "manual.design.performanceByDesignGoalsDefined": "1",
    "manual.design.responsiveAndAccessibilityStrategyDefined": "1",
    "manual.design.seoAndErrorStrategyDesigned": "1",
    "manual.setup.cdnConfigured": "1",
    "manual.setup.repoAndContentSourceConfigured": "1",
    "manual.setup.aemSidekickInstalledAndConfigured": "1",
    "manual.setup.ciCdPipelineConfigured": "1",
    "manual.setup.devStagingProdEnvironmentsSetUp": "1",
    "manual.setup.prProcessAndBranchingStrategyDefined": "1",
    "manual.setup.i18nAndTranslationSetup": "1",
    "manual.visualDesign.uiMatchesDesignMockupsAtAllViewports": "1",
    "manual.visualDesign.brandingAndInteractiveStatesConsistent": "1",
    "manual.userExperience.coreUserFlowsIntuitive": "1",
    "manual.userExperience.loadingEmptyErrorStatesPresent": "1",
    "manual.userExperience.formValidationUxVerified": "1",
    "manual.contentQuality.copySpellingGrammarLegalTextVerified": "1",
    "manual.contentQuality.cookieConsentMeetsGdprCcpa": "1",
    "manual.testing.contentPreviewAndPublishWorkflowValidated": "1",
    "manual.testing.functionalAndE2ETestingComplete": "1",
    "manual.testing.unitTestsAutomatedInCiCd": "1",
    "manual.testing.rumSetUpAndConfigured": "1",
    "manual.testing.crossBrowserAndDeviceTestingComplete": "1",
    "manual.security.apiEndpointsSecured": "1",
    "manual.security.rbacImplemented": "1",
    "manual.security.dataEncryptionAndGdprCompliant": "1",
    "manual.security.secretsManagementAndPenTestingDone": "1",
    "manual.authorValidation.authorTrainingAndSidekickVerified": "1",
    "manual.authorValidation.authorWorkflowValidatedInDocsSheets": "1",
    "manual.authorValidation.blockUsabilityReviewComplete": "1",
    "manual.authorValidation.documentToWebRenderingValidated": "1",
    "manual.performance.cdnCachingStrategyValidated": "1",
    "manual.performance.rumMonitoringAndAlertsConfigured": "1",
    "manual.performance.aboveTheFoldLoadsWithin2500ms": "1",
    "manual.accessibility.screenReaderTestingComplete": "1",
    "manual.accessibility.keyboardOnlyNavigationTested": "1",
    "manual.accessibility.axeWaveToolsRunAndRemediated": "1",
    "manual.i18n.rtlLayoutVerified": "1",
    "manual.i18n.textExpansionDoesNotBreakLayout": "1",
    "manual.i18n.localeFormattingCorrect": "1",
    "manual.architectureReview.designTokensMatchFigma": "1",
    "manual.architectureReview.webfontStrategyReviewed": "1",
    "manual.preGoLive.cdnCachingAndDnsFinalized": "1",
    "manual.preGoLive.deploymentAndRollbackPlanCreated": "1",
    "manual.preGoLive.previewAndLiveDomainValidated": "1",
    "manual.preGoLive.finalE2eSmokeLoadTestingComplete": "1",
    "manual.preGoLive.seoLaunchReadinessVerified": "1",
    "manual.postGoLive.centralizedLoggingAndAlertsConfigured": "1",
    "manual.postGoLive.cwvRumCdnMonitoringSetup": "1",
    "manual.postGoLive.authorSupportAndHelpdeskEstablished": "1",
    "manual.postGoLive.incidentResponseAndSlasDefined": "1",
    "manual.postGoLive.seoIndexingAndAnalyticsMonitored": "1",
    "manual.postGoLive.continuousImprovementPlanInPlace": "1",
    "manual.governance.projectManagementToolActivelyUsed": "1",
    "manual.governance.codeReviewProcessWithSlaDefined": "1",
    "manual.governance.qaEnvironmentMirrorsProduction": "1",
    "manual.governance.genAiGovernancePolicyDocumented": "1",
    "risk.discovery": "Low",
    "risk.contentQuality": "Low",
    "risk.internationalization": "Low",
    "risk.design": "Low",
    "risk.userExperience": "Low",
    "risk.visualDesign": "Low",
    "risk.setup": "Low",
    "risk.development": "High",
    "risk.architectureReview": "Low",
    "risk.testing": "Low",
    "risk.security": "High",
    "risk.performance": "High",
    "risk.accessibility": "High",
    "risk.authorValidation": "Low",
    "risk.preGoLive": "Low",
    "risk.postGoLive": "Low",
    "risk.processGovernance": "Low",
    "status.ragRating": "Amber",
    "status.goLiveReady": "No",
    "status.mandatoryPassRate": "53.3",
    "status.criticalPassRate": "36.0",
    "status.highPassRate": "60.4",
    "status.totalBlockingIssues": "138",
    "trend.totalIssues": "124",
    "trend.criticalIssues": "32",
    "trend.overallCompliance": "63.7",
    "trend.accessibilityCompliance": "35.7",
    "trend.performanceCompliance": "47.4",
    "trend.securityCompliance": "44.4",
    "trend.developmentCompliance": "33.6",
    "topIssues.count": "10",
    "topIssues.1.auditType": "Code Audit",
    "topIssues.1.phase": "Development",
    "topIssues.1.group": "HTML Semantics & Structure",
    "topIssues.1.subGroup": "Semantics",
    "topIssues.1.severity": "Critical",
    "topIssues.1.mandatory": "Yes",
    "topIssues.1.id": "DEV-SEMANTIC-DIV",
    "topIssues.1.description": "Semantic-to-div ratio above threshold; pages with >70% generic containers (div/span) flagged",
    "topIssues.1.evidence": "blocks/hero/hero.js",
    "topIssues.2.auditType": "Code Audit",
    "topIssues.2.phase": "Accessibility",
    "topIssues.2.group": "HTML Semantics & Structure",
    "topIssues.2.subGroup": "WCAG Core",
    "topIssues.2.severity": "High",
    "topIssues.2.mandatory": "Yes",
    "topIssues.2.id": "ACC-SKIP-LINKS",
    "topIssues.2.description": "Correct heading hierarchy maintained",
    "topIssues.2.evidence": "blocks/hero/hero.js",
    "topIssues.3.auditType": "Code Audit",
    "topIssues.3.phase": "Development",
    "topIssues.3.group": "HTML Forms & Inputs",
    "topIssues.3.subGroup": "Forms",
    "topIssues.3.severity": "Critical",
    "topIssues.3.mandatory": "Yes",
    "topIssues.3.id": "DEV-FORM-LABELS",
    "topIssues.3.line": "128",
    "topIssues.3.description": "All inputs have associated labels",
    "topIssues.3.evidence": "blocks/browse-filters/browse-filters.js",
    "topIssues.4.auditType": "Code Audit",
    "topIssues.4.phase": "Development",
    "topIssues.4.group": "HTML Forms & Inputs",
    "topIssues.4.subGroup": "Forms",
    "topIssues.4.severity": "Critical",
    "topIssues.4.mandatory": "Yes",
    "topIssues.4.id": "DEV-FORM-ERRORS",
    "topIssues.4.line": "45",
    "topIssues.4.description": "Error messages programmatically associated with inputs via aria-describedby or aria-errormessage; error containers use role='alert' or aria-live='assertive'; error text is non-empty and >10 characters",
    "topIssues.4.evidence": "scripts/form-validator.js",
    "topIssues.5.auditType": "Code Audit",
    "topIssues.5.phase": "Development",
    "topIssues.5.group": "HTML Forms & Inputs",
    "topIssues.5.subGroup": "Forms",
    "topIssues.5.severity": "Critical",
    "topIssues.5.mandatory": "Yes",
    "topIssues.5.id": "DEV-A11Y-NAME",
    "topIssues.5.description": "Accessible names for interactive elements",
    "topIssues.5.evidence": ".eslintrc.cjs",
    "topIssues.6.auditType": "Code Audit",
    "topIssues.6.phase": "Development",
    "topIssues.6.group": "HTML Media & Data",
    "topIssues.6.subGroup": "Images",
    "topIssues.6.severity": "Critical",
    "topIssues.6.mandatory": "Yes",
    "topIssues.6.description": "Alt text is not a filename or path; not generic (image/photo/icon/picture/graphic/banner/logo without qualifier); between 5-125 characters; does not duplicate adjacent text content; does not begin wit",
    "topIssues.6.evidence": "n/a",
    "topIssues.7.auditType": "Code Audit",
    "topIssues.7.phase": "Development",
    "topIssues.7.group": "HTML Metadata & Validation",
    "topIssues.7.subGroup": "Metadata",
    "topIssues.7.severity": "Critical",
    "topIssues.7.mandatory": "Yes",
    "topIssues.7.description": "Page <title> exists; is >10 characters; not a default value (Untitled/Document/Home/Page/Website/Welcome); follows consistent pattern across site (e.g. 'Page - Site' or 'Page | Site' separator detecte",
    "topIssues.7.evidence": "n/a",
    "topIssues.8.auditType": "Code Audit",
    "topIssues.8.phase": "Development",
    "topIssues.8.group": "HTML Metadata & Validation",
    "topIssues.8.subGroup": "IDs",
    "topIssues.8.severity": "Critical",
    "topIssues.8.mandatory": "Yes",
    "topIssues.8.description": "No duplicate IDs",
    "topIssues.8.evidence": "package.json",
    "topIssues.9.auditType": "Code Audit",
    "topIssues.9.phase": "Development",
    "topIssues.9.group": "HTML Metadata & Validation",
    "topIssues.9.subGroup": "Validation",
    "topIssues.9.severity": "Critical",
    "topIssues.9.mandatory": "Yes",
    "topIssues.9.description": "No invalid HTML nesting",
    "topIssues.9.evidence": "package.json",
    "topIssues.10.auditType": "Code Audit",
    "topIssues.10.phase": "Development",
    "topIssues.10.group": "HTML Metadata & Validation",
    "topIssues.10.subGroup": "Validation",
    "topIssues.10.severity": "Critical",
    "topIssues.10.mandatory": "Yes",
    "topIssues.10.description": "HTML validates without errors",
    "topIssues.10.evidence": "package.json",
    "components.count": "5",
    "components.1.name": ".eslintrc.cjs",
    "components.1.path": ".eslintrc.cjs",
    "components.1.failedChecks": "11",
    "components.1.criticalFailures": "3",
    "components.1.healthScore": "8",
    "components.2.name": "package.json",
    "components.2.path": "package.json",
    "components.2.failedChecks": "11",
    "components.2.criticalFailures": "6",
    "components.2.healthScore": "8",
    "components.3.name": "styles.css",
    "components.3.path": "styles/styles.css",
    "components.3.failedChecks": "4",
    "components.3.criticalFailures": "0",
    "components.3.healthScore": "20",
    "components.4.name": "scripts.js",
    "components.4.path": "scripts/scripts.js",
    "components.4.failedChecks": "3",
    "components.4.criticalFailures": "1",
    "components.4.healthScore": "40",
    "components.5.name": "browse-filters.js",
    "components.5.path": "blocks/browse-filters/browse-filters.js",
    "components.5.failedChecks": "2",
    "components.5.criticalFailures": "0",
    "components.5.healthScore": "0"
  }
  );

  function getFlatMetricsFromPayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    var m = payload.metrics;
    if (m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length > 0) {
      return m;
    }
    return null;
  }

  function groupMetricsByCategory(flat) {
    var groups = {};
    if (!flat || typeof flat !== "object") return groups;

    Object.keys(flat).forEach(function (key) {
      var parts = key.split(".");
      var category = parts.length > 1 ? parts[0] : "_root";
      var restPath = parts.length > 1 ? parts.slice(1).join(".") : key;
      if (!groups[category]) groups[category] = [];
      groups[category].push({
        fullKey: key,
        restPath: restPath,
        value: flat[key],
      });
    });

    Object.keys(groups).forEach(function (cat) {
      groups[cat].sort(function (a, b) {
        return a.restPath.localeCompare(b.restPath, undefined, { numeric: true, sensitivity: "base" });
      });
    });

    return groups;
  }

  function humanizeSegment(segment) {
    if (!segment) return "";
    var s = String(segment).replace(/([a-z])([A-Z])/g, "$1 $2");
    s = s.replace(/[-_]/g, " ");
    s = s.replace(/\./g, " · ");
    return s.replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function splitRestPathSegments(restPath) {
    if (restPath == null || restPath === "") return [];
    return String(restPath).split(".");
  }

  /** Labels like `Accessibility · Score` for flat keys `domains.accessibility.score`. */
  function formatMetricRestPathLabel(restPath) {
    return splitRestPathSegments(restPath)
      .map(function (part) {
        return humanizeSegment(part);
      })
      .join(" · ");
  }

  function metricRowTitleAndSubtitle(restPath) {
    var parts = splitRestPathSegments(restPath);
    if (!parts.length) return { title: "", subtitle: "" };
    if (parts.length === 1) {
      return { title: humanizeSegment(parts[0]), subtitle: "" };
    }
    return {
      title: humanizeSegment(parts[0]),
      subtitle: parts
        .slice(1)
        .map(function (p) {
          return humanizeSegment(p);
        })
        .join(" · "),
    };
  }

  /** Percent-style metrics (0–100) that get a progress bar and derived passed/total. */
  function isScoreLikeMetric(restPath, fullKey) {
    if (fullKey && typeof fullKey === "string" && /^scores\./.test(fullKey)) return true;
    var last = fullKey && typeof fullKey === "string" ? fullKey.split(".").pop() : "";
    if (restPath && /(score|passrate|failrate)$/i.test(restPath)) return true;
    if (last && /(score|passrate|failrate)$/i.test(last)) return true;
    return false;
  }

  function sortCategoryNames(names) {
    return names.slice().sort(function (a, b) {
      if (a === "_root") return 1;
      if (b === "_root") return -1;
      var ia = CATEGORY_ORDER.indexOf(a);
      var ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  var DONUT_PALETTE = ["#e9d5ff", "#d9f99d", "#a5f3fc", "#fde68a", "#fbcfe8", "#cbd5e1", "#fda4af", "#93c5fd"];

  /** Pillar keys under `scores.*` for the main compliance donut (avoids dozens of phase scores). */
  var SCORE_DONUT_SLICE_ORDER = [
    "htmlImplementation",
    "cssImplementation",
    "javascriptImplementation",
    "accessibility",
    "performance",
    "codeQuality",
    "security",
    "processGovernance",
  ];

  function buildDonutSlicesFromFlat(flat) {
    var slices = [];
    var center = null;

    if (!flat) {
      return { slices: [], center: null };
    }

    var coRaw = flat["scores.overall"];
    if (coRaw !== undefined && coRaw !== null && coRaw !== "") {
      var cn = Number(coRaw);
      if (isFinite(cn)) center = cn;
    }

    var sliceIdx = 0;
    SCORE_DONUT_SLICE_ORDER.forEach(function (sk) {
      var key = "scores." + sk;
      if (!Object.prototype.hasOwnProperty.call(flat, key)) return;
      var raw = flat[key];
      if (raw === "" || raw == null) return;
      var n = Number(raw);
      if (!isFinite(n)) return;
      slices.push({
        title: humanizeSegment(sk),
        value: Math.max(0, n),
        color: DONUT_PALETTE[sliceIdx++ % DONUT_PALETTE.length],
      });
    });

    if (center != null || slices.length > 0) {
      if (center == null) {
        var legCenter = flat["overallScores.uiQualityScore"];
        if (legCenter !== undefined && legCenter !== null && legCenter !== "") {
          var lc = Number(legCenter);
          if (isFinite(lc)) center = lc;
        }
      }
      return { slices: slices, center: center != null && isFinite(center) ? center : null };
    }

    var prefix = "overallScores.";
    Object.keys(flat).forEach(function (k) {
      if (k.indexOf(prefix) !== 0) return;
      var suffix = k.slice(prefix.length);
      if (!/Score$/i.test(suffix)) return;
      var raw = flat[k];
      if (raw === "" || raw == null) return;
      var n = Number(raw);
      if (!isFinite(n)) return;

      if (suffix === "uiQualityScore") {
        center = n;
        return;
      }

      var label = humanizeSegment(suffix.replace(/Score$/i, ""));
      slices.push({
        title: label,
        value: Math.max(0, n),
        color: DONUT_PALETTE[slices.length % DONUT_PALETTE.length],
      });
    });

    return { slices: slices, center: center != null && isFinite(center) ? center : null };
  }

  function pickMetadataEntries(flat) {
    var prefix = "metadata.";
    var list = [];
    if (!flat) return list;
    Object.keys(flat).forEach(function (k) {
      if (k.indexOf(prefix) !== 0) return;
      var rest = k.slice(prefix.length);
      list.push({ key: k, restPath: rest, value: flat[k] });
    });
    list.sort(function (a, b) {
      return a.restPath.localeCompare(b.restPath);
    });
    return list;
  }

  function getMetadataMap(flat) {
    var map = {};
    pickMetadataEntries(flat).forEach(function (e) {
      map[e.restPath] = e.value;
    });
    return map;
  }

const AuditDashboardMetrics = {
  DEFAULT_AUDIT_METRICS: DEFAULT_AUDIT_METRICS,
  CATEGORY_ORDER: CATEGORY_ORDER,
  SCORE_DONUT_SLICE_ORDER: SCORE_DONUT_SLICE_ORDER,
  getFlatMetricsFromPayload: getFlatMetricsFromPayload,
  groupMetricsByCategory: groupMetricsByCategory,
  humanizeSegment: humanizeSegment,
  splitRestPathSegments: splitRestPathSegments,
  formatMetricRestPathLabel: formatMetricRestPathLabel,
  metricRowTitleAndSubtitle: metricRowTitleAndSubtitle,
  isScoreLikeMetric: isScoreLikeMetric,
  sortCategoryNames: sortCategoryNames,
  buildDonutSlicesFromFlat: buildDonutSlicesFromFlat,
  pickMetadataEntries: pickMetadataEntries,
  getMetadataMap: getMetadataMap,
  DONUT_PALETTE: DONUT_PALETTE,
};
globalThis.AuditDashboardMetrics = AuditDashboardMetrics;

export default AuditDashboardMetrics;
export {
  DEFAULT_AUDIT_METRICS,
  CATEGORY_ORDER,
  SCORE_DONUT_SLICE_ORDER,
  getFlatMetricsFromPayload,
  groupMetricsByCategory,
  humanizeSegment,
  splitRestPathSegments,
  formatMetricRestPathLabel,
  metricRowTitleAndSubtitle,
  isScoreLikeMetric,
  sortCategoryNames,
  buildDonutSlicesFromFlat,
  pickMetadataEntries,
  getMetadataMap,
  DONUT_PALETTE,
};
