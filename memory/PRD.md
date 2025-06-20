Product Requirements Document: BahinLink

Version: 1.1
Date: October 26, 2025
Prepared by: Bard (Prosper)

1.0 Introduction & Vision
1.1 Project Overview

BahinLink is a mobile-first workforce management solution designed for Bahin SARL, a private security company. This application will streamline operations by providing real-time tracking of security personnel, centralizing communications and reporting, automating scheduling and timekeeping, and offering clients transparency into service delivery. The primary target is Android devices, with future consideration for iOS and web application expansion.

1.2 Goals & Objectives

BahinLink aims to achieve the following:

Improve Operational Efficiency: Reduce time loss and human error associated with manual processes.

Enhance Real-Time Control: Provide supervisors and management with immediate visibility into personnel location and status.

Increase Client Satisfaction: Build trust and transparency by enabling clients to monitor security services in real-time.

Project a Professional Image: Equip Bahin SARL with a modern, technologically advanced solution, showcasing its commitment to innovation and efficiency.

Data-Driven Decision Making: Facilitate better decision-making through access to reliable operational data and analytics.

1.3 Target Audience & User Personas

Administrator (Back-office): Management and HR personnel responsible for overall system configuration, user management, scheduling, reporting, and communication.

Supervisor (Field Management): Team leaders overseeing security agents in the field. They need real-time monitoring, report validation, incident management, and direct communication with agents.

Security Agent (Field Personnel): Security guards performing duties at client sites. They need an easy-to-use mobile interface for clocking in/out, reporting incidents, and communicating with supervisors.

Client (Optional Access): Customers of Bahin SARL who desire real-time visibility into the security services provided at their sites, access to reports, and the ability to report incidents or request urgent services.

2.0 Functional Requirements
2.1 Core Features

Real-time GPS Tracking & Geofencing: Track the location of security personnel on an interactive map. Geofencing defines client site boundaries for automatic clock-in/out verification.

Scheduling & Shift Management: Automated scheduling tools for administrators to create, manage, and assign shifts to agents based on skills, availability, and location. Automatic notifications of new assignments for agents.

Time & Attendance Management: Mobile clock-in/out with geolocation and QR code scanning for enhanced accuracy and security. Real-time attendance status updates for supervisors and administrators.

Reporting (Patrol & Incident): Simplified digital reporting tools for patrol reports and incident reporting. Supervisors can review, approve/reject, and edit reports. Electronic client signatures for report validation. Option to add photos/videos as supporting documentation. Automatic report archiving and client delivery.

Communication & Notifications: Real-time notifications to alert appropriate personnel about critical events (e.g., agent location outside geofence, incident reports, SOS alerts, new schedule assignments). Internal communication channels between all user roles.

Client Portal (Limited Access): Secure portal for clients to view personnel deployment at their site in real-time, access generated reports (PDF), report incidents, request additional services, and communicate with Bahin SARL personnel as needed.

Dashboard and Analytics: Generate statistical dashboards for administrators to track key metrics on service delivery performance.

Administrative Tools: Full system user access management with secure authentication for each role.

2.2 Detailed Feature Breakdown (User Stories)

Administrator:

As an administrator, I want to create, edit, and delete user accounts so that I can manage access to the system effectively.

As an administrator, I want to create and manage work schedules and shifts so that I can effectively allocate resources to client sites.

As an administrator, I want to track agent attendance in real-time so that I can efficiently manage and allocate staff.

As an administrator, I want to assign agents to sites and time slots automatically (based on various criteria) or manually, optimizing resource deployment.

As an administrator, I want access to detailed agent profiles (including history, skills, and performance) so that I can understand our workforce’s composition better and make informed assignments.

As an administrator, I want to be able to access, filter, sort, archive, and download completed reports and statistics.

As an administrator, I want the ability to configure general application settings and features for effective system control and tailoring to the evolving needs of the business.

Supervisor:

As a supervisor, I want to view all assigned agent presences on an interactive map so that I have real-time location and status awareness of my team.

As a supervisor, I want to receive immediate alerts about critical incidents and status deviations for immediate attention.

As a supervisor, I want tools to validate, reject, request edits to, and approve agent-submitted reports so that I can ensure their completeness and accuracy.

As a supervisor, I want to easily send direct communications, instructions, updates and announcements to my agents.

As a supervisor, I want an online and offline inspection reporting capability that provides digital tools to quickly write and send detailed inspection reports.

Security Agent:

As a security agent, I want to clock in and out of my shifts seamlessly through GPS location tracking so I have precise proof of time and place spent fulfilling assigned tasks.

As a security agent, I want easy QR code scan support, enhancing clock-in/out location and workflow integration at client sites with or without strong data network.

As a security agent, I want access to my scheduled shifts so that I'm always aware of my responsibilities.

As a security agent, I want simplified digital report generation to allow simple, quick submission for standard patrols. I also require detailed form sections allowing specifics for unusual event capture such as for emergency reports and client communications

As a security agent, I want the ability to report security related incidents, submit reports, observations, events, and actions during patrols, including photo/video support as verifiable proof so that a full detailed incident documentation is archived without the burden of excessive work beyond current handwritten report systems and processes already familiar.

Client:

As a client, I want to be able to monitor in real-time my location(s) for Bahin assigned security agents along with easy to view duty status details as it applies directly to me as well as receive prompt event notifications regarding those services so that I maintain insight into my service fulfillment performance metrics.

As a client, I want to retrieve service-specific reports and incident details at anytime on demand without further communications delays to allow internal management processes within my organization to address them appropriately and/or take further appropriate follow up action on the issues contained.

As a client, I need streamlined methods to quickly request extra services from Bahin and prompt report emergency issues during off-shift as a primary security resource requirement in the form of support, urgent issues communications and incident response request initiation allowing immediate reporting, reducing risks due to incidents or events where no personnel may otherwise be scheduled during those unscheduled periods as agreed via service fulfillment terms agreed to for the given business.

2.3 Data Requirements

The application will require a database capable of handling the following data:

User Data: User ID, username, password (securely hashed), role (Admin, Supervisor, Agent, Client), contact information, status.

Agent Data: Agent ID, user ID, photo, contact information, certifications, skills, availability, performance statistics.

Site Data: Site ID, client ID, name, address, geofence coordinates, QR code.

Shift Data: Shift ID, site ID, agent ID, date, start time, end time, status.

Report Data: Report ID, type (patrol, incident), shift ID, site ID, agent ID, timestamp, observations, incidents, client electronic signature, photos/videos (URLs).

Notification Data: Notification ID, recipient ID, type, message, timestamp, read status.

Communication Log Data: Message ID, sender ID, recipient ID, message content, timestamp.

Audit Log Data: Event timestamp, user ID, action performed, affected data, originating device information.

Client Request Data: request ID, client ID, site ID, nature, timestamp, action taken.

3.0 Non-Functional Requirements
3.1 User Interface (UI) & User Experience (UX)

The application must have a clear, intuitive, and ergonomic design. Bahin SARL requests a professional aesthetic in line with popular workforce management and communication apps (such as Asana or Slack).

3.2 Platform & Environment

Primary Target Platform: Android mobile application (optimized for entry-level devices). Offline functionality required for core features including clocking in/out (with geolocation backup to device where gps may be impacted due to intermittent signal strengths), filling out, completing, and submitting report creation when offline. This capability must include queueing offline submissions during offline, with transmission after re-establishment of network connection with prioritization support before new offline items queued to assure transmission as per incident and submission time priority requirements to provide accuracy assurances and support forensic incident history needs during incidents across all sites, if a larger issue occurs. Auto-sync enabled with reconnected network.

Secondary Target Platform: Web application for administrative backend.

3.3 Constraints & Business Rules

Data Encryption: All sensitive data (user credentials, client information, etc.) must be encrypted in transit and at rest, compliant with GDPR regulations.

User Permissions: Agents see their own missions/schedules; Clients only see their assigned sites' information.

3.4 Security & Privacy Considerations

Secure authentication and authorization for each user role will use standards based user access and authorization. Two-factor authentication must also be included where feasible with best effort reasonable to incorporate when final specifications made in alignment with technical resource considerations with the given project schedule available along with client feedback.

Client data must be treated and managed according to GDRP security recommendations. Additional or expanded security features implemented that meet additional industry standards above GDPR may also be included when client reviewed feedback includes them after further specification and planning steps prior to next releases/phased launches of new features are scheduled accordingly.

Data access logging and audits will be regularly performed for monitoring activity purposes where risks determined as appropriate by project management, client business management oversight reviews of the product, user and technical review specifications feedback from QA validation tests by each key project participant.

Regular penetration testing from internal QA or from security audit firms is highly encouraged.

4.0 Success Criteria & Acceptance Criteria

Scenario 1 (Agent Workflow): An agent logs in, views their assigned shift, clocks in via QR and confirmed GPS location within predefined geo-fencing bounds of the client's site perimeter. They complete a patrol report including evidence and incidents observations along with optional support photo/video uploads during a shift even if device is off or with minimal/offline and they successfully clock-out using location reporting even when offline. The supervisor is immediately notified (push notification on new items ready for their validation with offline capabilities) and verifies the shift hours via report submissions and geolocation tracked records. They acknowledge the completed items received before sending to the Client for their review and final signature confirmation electronically using signature technology commonly available.

Scenario 2 (Administrative Task): An administrator creates a new schedule with multiple shifts for different client sites. They select and successfully assign agents to the appropriate slots, ensuring there are no timing or skills mismatches based on agent’s known special requirements (e.g., language skill requirement on the assigned location or shift that has requirements from customer based upon those particular criteria). They review shift assignment metrics before pushing to all personnel after confirmation review including email/message communication to each team member. Assigned agents receive notifications for their new assignments (email and app internal messaging) and are able to check those details from dashboard or calendar widgets based upon user interface selection and preferences configured via mobile platform options when account initially configured. They log any requests for adjustments as needed as per the agent management process within their user interface via feedback mechanism to facilitate review by Administrator after acknowledgement notification confirmation via return acknowledgement within some defined timeframe and before shift times in progress (with alert if unacknowledged and agent status update with confirmation before start or at any period needed such as last moment status or agent health impact for their shift). Client is immediately updated with updated security staff coverage changes for their scheduled locations for their shifts. They respond before any planned active patrol shifts begin at their assigned site to finalize process flow within the allocated time window of any current and open assigned shifts requiring confirmations between agents, admin staff and clients.

Scenario 3 (Client Urgent Incident): A client reports an urgent incident. Relevant supervisors and administrators instantly receive an app based urgent incident alert notification, containing relevant location specific information from form used for those urgent notifications such as location info, issue type, time stamp along with details of the issue impacting security at the client’s location so they understand and follow the predefined Incident Alert response plan established with their specific escalation process details based on defined service level commitment requirements and timeframe expected responses (acknowledge receipt before period T) and escalation plans with alternate on-call management after extended delays so as to improve responsiveness overall by automating issue detection reporting via platform features using existing security protocol measures required as determined when first service contracts generated from start before the Client’s service contracts confirmed as part of the initial signup and/or ongoing account adjustment agreements managed between admin and Client roles. Agent status for those responding are recorded accordingly using updated incident response report types during the events in progress, in the application or in system notification methods or in both when specifications confirmed when features incorporated as new features.

5.0 Future Considerations / Roadmap

iOS Compatibility: Expand platform support to iOS mobile devices (iPhone/iPad) once existing user base in primary targets established on platform from first few rounds. Also ensure parity features between platform and any implementation differences, along with security feature equivalence is prioritized before final delivery based upon user adoption needs between platforms on subsequent releases during phased rollout strategy established early once MVP finalized on a schedule timeline with user requirements confirmed post first launch on earliest releases to early adopter test groups via some trial or soft launch for select early user participants of various levels (internal agents initially for each area and client subsets participating on any newer iterations after feedback gathered between launches with full participation from full sets only once feature maturity sufficient, data and review feedback is completed. Client also must review before each release of each user’s functionality area for usability test review by full test client user subset (minimum 10%) selected as participants after selection process and criteria decided after launch and first rounds concluded using agreed on metric results across defined user stories as completed. Further phased user based test sets to gradually include other client’s user roles during later deployments until complete deployment of user features available before proceeding for new MVP releases using existing launch/soft launch process as established in those initial versions.

Advanced Analytics & Reporting: Incorporate sophisticated data analysis and reporting features with metrics for operational analysis reporting dashboard features (data on trends from each category to visualize metrics in graphical presentation forms) using popular data vis technologies appropriate such as open source graphing support toolsets where most suited based upon data volume requirements to generate, manage reports using them at project schedule delivery and after, across client-defined parameters after launch of second phase where such metric requirements clarified, for delivery no later than date and time specified at project outset for feature roadmap expectations prior and no later than a full week period of time after first round client feedback has completed after new reporting requests identified, gathered during prior iteration rounds for validation and integration during following sprints. Project team needs final validation via specification update documents between iterations from earliest to latest no later than end of week of those sprint’s durations to adjust planned next sprint start dates using same sprint duration methodology as initially defined from project starting point at inception without further revision on length, so maintain time consistency within the project scope once started.

Integration with Third-Party Systems: API and documented specification releases for supporting potential future integration points from other clients and integration needed for security systems, security event sensors/devices used for data feeds reporting across site(s) once validated as part of some defined validation set completed for integrations API endpoints.

6.0 Assumptions & Open Questions

Specific Visual Style: The PRD assumes a preference for clean, modern interfaces like Asana or Slack. Further design consultation with Bahin SARL is essential to solidify specific UI/UX details using feedback gathered before any visual style finalized from client. Also test designs with focus test groups from internal and client roles (5-10 members for initial internal review and 5-10 users within test group selected via sampling within participating early client beta users initially during pilot for later iterations of prototype user testing with broader users set at later launch rounds, using selection by representative based on key profile criteria by user role for better accuracy representing various typical usage metrics across wider samples based upon feedback and activity/participation to provide statistically relevant results from those feedback processes using methodologies that are industry standard. User group selections must account for diversity criteria by all major usage data attributes after pilot when expanding usage base via full launch and phased expansion to remaining accounts later in next iteration cycles and future sprints if features require that before launching with fully represented users sampling group on each project deployment schedule agreed before deployment start and release readiness reviews completed before any client-facing release after client approved test and staging rollout first. Any feedback should consider design preferences across target mobile platforms for compatibility reasons and design framework preferences if some visual platform styles deemed incompatible and impacting those platform UI framework guidelines for UI framework standards, so as not to generate platform inconsistent, poorly visually integrated implementations which significantly deviate from target platform UX recommendations from the leading software framework UI/UX styles in production at project creation point in time. Use best fit or closest to original vision with documented revisions when client deviations need alternative approaches using framework UI guidelines from leading UI frameworks of software mobile industry by end dates each sprint requires before next launch can finalize. Feedback review from client on every update document submitted with visual presentations showing how changes deviate so any revisions or compromises reached during sprints when such changes arise impacting platform consistency after user feedback from those platform UI framework preferences are completed at each update release to next phase by defined timeline each feature update release set, including full update summaries when needed or during release summaries during user meetings/feedback review meetings.

Offline Behavior Detail: Technical mechanisms for offline support to assure data synchronization (conflicts and version consistency with server database), user error and message queue size/limits with prioritization for client communications, urgent issues management needs should undergo further definition in user and functional analysis design review steps before development is finalized via signed approval on agreed and client confirmed, functional spec document with explicit rules covering scenarios required for offline usage during periods lacking strong enough data connection or intermittent disruption situations, or total outage scenarios with full resolution and priority consideration for any actions taken during and subsequent periods until system online to provide reasonable business acceptable outcome or failure plan agreed ahead with all project key participants represented (agents and business rep as primary participant minimum), as key features of priority by date provided to implement by any timeframe before the soft-launch phase of next major cycle where feature planned for inclusion within that project stage. These details are outlined and signed before any development phase to assure offline business process needs remain documented across any offline disruption events without data and security compromising behavior within the system during these periods. Those signed specification review agreements are treated as requirement changes impacting timelines by predefined protocols specified and understood at any period within or at any period subsequent phases beyond initial proposal phase within and during further discussion. Document status for offline handling using business scenarios for those requirements with final outcome acceptable for system’s responses covering different possible operational events based upon offline situation from brief outage/hiccups/errors due to mobile or base station communications network issues to total failures of connectivity based upon geographic, data service outage by third-party providers which happen to be in client usage areas impacting site and services fulfilling tasks by agreed upon user groups that are primarily field focused (security staff for first responder, event communications and notifications alerts, for client event and request forms submissions where impacted or if not) due to disruption based on location, site device, incident report time occurrence with any additional prioritization needed to resolve data order integrity based upon real-time metrics where prioritization depends to maintain business acceptable usage performance during partial to full data access loss at agent level or supervisor reporting level impacted for events.

Data Retention Policy: Requirements around how long various types of data are kept need further clarity and should conform with any legal or industry best practices as well as industry standard requirements from privacy data handling in place as mandated at project point or which become mandate to maintain current legal and regulatory practices across entire regions supporting or intended for market presence in the future within documented market planning expansion details. Bahin SARL to specify via final feedback to assure product complies within those periods prior any deployment launch period if any changes to data handling arise from existing regulations in any service area after requirements review steps and project acceptance milestones occur.

7.0 Out of Scope (for v1.0)

iOS Application: iOS version not in initial scope but considered for future development

Advanced analytics beyond basic reporting: Sophisticated analytical functionalities (e.g., AI powered workforce deployment predictions etc). These features not specified nor are intended on current MVP but considered as roadmap discussion material in future once initial client implementation achieved during initial beta tests from start. Decisions are to include these if client decides during pre- and initial launch milestones so any revisions to roadmap after each review are managed and addressed with respect to how existing plans deviate via changes based upon existing finalized project time frames established from project beginning so further iterations during those steps, for MVP requirements where these items are confirmed after initial sign-off when contracts are finalized and projects are launched before alpha or any client pre-launch or release stages before broader initial rollout, but may continue as revisions up to first launch if new requirements fall within accepted boundaries defined to not derail initial implementation scope of work. This assurance applies to each sprint so impact reduced significantly so MVP release time goals still feasible. Client feedback review happens by next sprint on any requests impacting initial rollout stages of any launch stage within and after signoff milestone achieved when current agreements finalized to clarify if those plans adjust further from initial plan agreement and project management milestones already signed by each relevant party for ongoing commitments already accepted without delays exceeding planned implementation cycle time if features are deemed suitable in the initial scope via feedback gathered before a major product release, by some formal client sign off of each feedback iteration when specs documents finalized in iterations each user's role during development as per specifications review process that occur throughout that time after they have been tested by those early access members with roles that reflect planned user’s access profiles in system’s security models to provide feedback on a specified form with metrics as key details required from feedback during review sessions held at end of every project cycle before deployment launch periods and soft-launch when tests are complete enough.

Integration with existing Bahin systems/external services: Data from HR systems (e.g., payroll and employee records) are managed by the Bahin business as part of its existing internal management processes in other system deployments they utilize. At project start, data handling from that end isn’t integrated directly or otherwise managed by the application within or as any other form outside this implementation on other platform they manage internally or those deployed via third-party data processing vendors such as for hosted Cloud services, within client’s managed systems if that requirement exist during those implementation times, or in the case no technical access feasibility within or outside client internal systems they manage which are inaccessible within and as accessible system interface layer via any integration capabilities by other vendor platforms that their applications provide for this particular product within scope.

Automated report generation: For automated summaries, data from multiple reports/trends within the generated patrol and inspection related incidents (e.g., auto report summaries are to be done manually by admins where relevant using reporting capabilities of systems after retrieval using reports functions from dashboard for each required report interval/periods using platform interfaces). Future reporting enhancement plans for the current MVP scope exclude automatic report summaries but allow automated distribution to end-users/client after validation from a reviewer (administrator before finalized). Additional auto feature based report summaries on dashboards should be considered during early alpha phases using feedback with MVP for any inclusion of such planned feature expansions with clear timelines to those next version launches where this type of additional metrics deemed acceptable in following iterations with revised specifications using current project management approach established prior launch of earliest access beta trial runs by specified timelines using documented agreements with each required feedback group’s approval from end-user set.
