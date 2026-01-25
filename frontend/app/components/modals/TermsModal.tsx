'use client'

import { useState } from 'react'

interface TermsModalProps {
  loading: boolean
  error: string | null
  onAccept: () => Promise<void>
}

export function TermsModal({ loading, error, onAccept }: TermsModalProps) {
  const [accepted, setAccepted] = useState(false)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollTop + clientHeight >= scrollHeight - 10) {
      setScrolledToBottom(true)
    }
  }

  const handleAccept = async () => {
    if (!accepted) return
    await onAccept()
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Terms of Service</h3>
              <p className="text-slate-400 text-sm">Please read and accept to continue</p>
            </div>
          </div>
        </div>

        {/* Scrollable Terms Content */}
        <div
          className="flex-1 overflow-y-auto p-6 text-slate-300 text-sm leading-relaxed space-y-4"
          onScroll={handleScroll}
        >
          <p className="text-slate-400 italic">Last Updated: January 2025</p>

          <p>
            Welcome to Minecraft Hosting by Infinabyte ("Service", "we", "us", or "our"). By accessing or using our Service, you agree to be bound by these Terms of Service ("Terms"). Please read them carefully.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">1. Acceptance of Terms</h4>
          <p>
            By creating an account and using our Service, you acknowledge that you have read, understood, and agree to be bound by these Terms. If you do not agree to these Terms, you may not access or use the Service.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">2. Description of Service</h4>
          <p>
            Infinabyte provides on-demand Minecraft server hosting services. We offer virtual server resources for running Minecraft game servers. The Service is provided on an "as-is" and "as-available" basis.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">3. Acceptable Use Policy</h4>
          <p>You agree NOT to use the Service to:</p>
          <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
            <li>Violate any applicable laws, regulations, or third-party rights</li>
            <li>Host, distribute, or transmit malicious code, malware, or any harmful software</li>
            <li>Conduct denial-of-service (DoS) attacks, port scanning, or any form of network abuse</li>
            <li>Engage in cryptocurrency mining or any resource-intensive activities not related to Minecraft</li>
            <li>Host content that is illegal, defamatory, harassing, threatening, or promotes violence</li>
            <li>Distribute pirated software, copyrighted content, or intellectual property you do not own</li>
            <li>Attempt to gain unauthorized access to our systems, other users' servers, or any third-party systems</li>
            <li>Use the Service for spamming, phishing, or fraudulent activities</li>
            <li>Resell, sublicense, or redistribute the Service without our written consent</li>
            <li>Abuse our trial or free tier offerings through multiple accounts or deceptive practices</li>
            <li>Harass, abuse, or harm other users of the Service</li>
          </ul>

          <h4 className="text-lg font-semibold text-white mt-6">4. Account Responsibilities</h4>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to immediately notify us of any unauthorized use of your account. We reserve the right to suspend or terminate accounts that violate these Terms.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">5. Service Availability and Uptime</h4>
          <p className="font-semibold text-amber-400">
            INFINABYTE AND MINECRAFT HOSTING MAKE NO GUARANTEES REGARDING SERVICE AVAILABILITY, UPTIME, OR RELIABILITY.
          </p>
          <p className="mt-2">
            While we strive to provide reliable service, you acknowledge and agree that:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
            <li>The Service may experience downtime, outages, or interruptions at any time, with or without notice</li>
            <li>Scheduled or unscheduled maintenance may temporarily disrupt service availability</li>
            <li>We are not responsible for any loss of data, progress, or game state resulting from service interruptions</li>
            <li>Network issues, hardware failures, or circumstances beyond our control may affect service performance</li>
            <li>We do not guarantee any specific uptime percentage or service level agreement (SLA) unless explicitly stated in a separate paid agreement</li>
          </ul>

          <h4 className="text-lg font-semibold text-white mt-6">6. Data and Backups</h4>
          <p>
            While we may perform routine backups, YOU ARE SOLELY RESPONSIBLE FOR MAINTAINING YOUR OWN BACKUPS of all server data, world files, configurations, and any other content stored on the Service. We are not liable for any data loss, corruption, or deletion.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">7. Limitation of Liability</h4>
          <p className="font-semibold text-amber-400">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, INFINABYTE, MINECRAFT HOSTING, AND THEIR AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
            <li>Any indirect, incidental, special, consequential, or punitive damages</li>
            <li>Loss of profits, revenue, data, or business opportunities</li>
            <li>Service interruptions, outages, or downtime</li>
            <li>Data loss, corruption, or unauthorized access</li>
            <li>Any damages resulting from your use or inability to use the Service</li>
            <li>Any third-party actions, content, or services</li>
          </ul>
          <p className="mt-2">
            Our total liability for any claims arising from the Service shall not exceed the amount you paid us in the three (3) months preceding the claim.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">8. Disclaimer of Warranties</h4>
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">9. Indemnification</h4>
          <p>
            You agree to indemnify, defend, and hold harmless Infinabyte, Minecraft Hosting, and their affiliates from any claims, damages, losses, liabilities, costs, and expenses (including legal fees) arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">10. Intellectual Property</h4>
          <p>
            "Minecraft" is a trademark of Mojang Studios / Microsoft Corporation. We are not affiliated with, endorsed by, or sponsored by Mojang Studios or Microsoft. All other trademarks, logos, and service marks belong to their respective owners.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">11. Termination</h4>
          <p>
            We reserve the right to suspend or terminate your access to the Service at any time, with or without cause, with or without notice. Upon termination, your right to use the Service ceases immediately, and we may delete your data without liability.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">12. Modifications to Terms</h4>
          <p>
            We reserve the right to modify these Terms at any time. We will notify users of material changes by email or through the Service. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">13. Governing Law</h4>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Infinabyte operates, without regard to its conflict of law provisions.
          </p>

          <h4 className="text-lg font-semibold text-white mt-6">14. Contact Information</h4>
          <p>
            For questions about these Terms, please contact us through the Support feature in the application or at support@infinabyte.com.
          </p>

          <div className="bg-slate-800/50 rounded-lg p-4 mt-6 border border-slate-700">
            <p className="text-slate-400 text-xs">
              By clicking "I Accept" below, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
          </div>
        </div>

        {/* Footer with Checkbox and Button */}
        <div className="p-6 border-t border-slate-700 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {!scrolledToBottom && (
            <p className="text-amber-400 text-sm text-center flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              Please scroll down to read the full terms
            </p>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={!scrolledToBottom}
              className="mt-1 w-5 h-5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${scrolledToBottom ? 'text-slate-300' : 'text-slate-500'}`}>
              I have read and agree to the Terms of Service. I understand that Infinabyte and Minecraft Hosting are not liable for service outages, data loss, or any damages arising from the use of this Service.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!accepted || loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                I Accept
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
