import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

interface LegalPageProps {
  type: 'privacy' | 'terms' | 'support';
  onBack: () => void;
}

export function LegalPages({ type, onBack }: LegalPageProps) {
  const getPageContent = () => {
    switch (type) {
      case 'privacy':
        return {
          title: 'Privacy Policy',
          lastUpdated: 'December 15, 2024',
          content: (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold mb-3">Information We Collect</h3>
                <div className="space-y-3 text-gray-600">
                  <p>We collect information you provide directly to us, such as when you:</p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Create an account or profile</li>
                    <li>Book a turf or join a game</li>
                    <li>Contact us for support</li>
                    <li>Use our search and filtering features</li>
                  </ul>
                  <p>This may include your name, email address, phone number, and location data (with your permission).</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">How We Use Your Information</h3>
                <div className="space-y-3 text-gray-600">
                  <p>We use the information we collect to:</p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Provide, maintain, and improve our services</li>
                    <li>Process bookings and facilitate communications</li>
                    <li>Show you relevant turfs based on your location</li>
                    <li>Send you important updates about your bookings</li>
                    <li>Provide customer support</li>
                  </ul>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Information Sharing</h3>
                <div className="space-y-3 text-gray-600">
                  <p>We do not sell, rent, or share your personal information with third parties except:</p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>With turf owners when you make a booking (name and contact info only)</li>
                    <li>When required by law or to protect our rights</li>
                    <li>With service providers who help us operate our platform</li>
                  </ul>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Data Security</h3>
                <div className="text-gray-600">
                  <p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure.</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Contact Us</h3>
                <div className="text-gray-600">
                  <p>If you have any questions about this Privacy Policy, please contact us at privacy@tapturf.in</p>
                </div>
              </section>
            </div>
          )
        };

      case 'terms':
        return {
          title: 'Terms of Service',
          lastUpdated: 'December 15, 2024',
          content: (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold mb-3">Acceptance of Terms</h3>
                <div className="text-gray-600">
                  <p>By accessing and using TapTurf, you accept and agree to be bound by the terms and provision of this agreement.</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Use of Service</h3>
                <div className="space-y-3 text-gray-600">
                  <p>TapTurf is a platform that connects users with turf facilities. You agree to:</p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Provide accurate and complete information</li>
                    <li>Use the service only for lawful purposes</li>
                    <li>Respect the rights of other users and turf owners</li>
                    <li>Not create false or misleading bookings</li>
                  </ul>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Bookings and Payments</h3>
                <div className="space-y-3 text-gray-600">
                  <ul className="list-disc ml-6 space-y-1">
                    <li>All bookings are subject to turf owner approval</li>
                    <li>Payment terms are set by individual turf owners</li>
                    <li>Cancellation policies vary by turf facility</li>
                    <li>TapTurf is not responsible for disputes between users and turf owners</li>
                  </ul>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Limitation of Liability</h3>
                <div className="text-gray-600">
                  <p>TapTurf acts as a platform connecting users with turf facilities. We are not liable for any damages, injuries, or losses that may occur during your use of booked facilities.</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Modifications</h3>
                <div className="text-gray-600">
                  <p>We reserve the right to modify these terms at any time. Continued use of the service after changes indicates acceptance of the new terms.</p>
                </div>
              </section>
            </div>
          )
        };

      case 'support':
        return {
          title: 'Support & Help',
          lastUpdated: null,
          content: (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold mb-3">Frequently Asked Questions</h3>
                
                <div className="space-y-4">
                  <div className="border-l-4 border-primary-200 pl-4">
                    <h4 className="font-medium mb-2">How do I book a turf?</h4>
                    <p className="text-gray-600">Search for turfs in your area, select your preferred facility, and click "Book via WhatsApp" to contact the owner directly.</p>
                  </div>

                  <div className="border-l-4 border-primary-200 pl-4">
                    <h4 className="font-medium mb-2">Is my booking confirmed?</h4>
                    <p className="text-gray-600">Bookings are confirmed directly with turf owners via WhatsApp or phone. We recommend confirming your slot before arriving.</p>
                  </div>

                  <div className="border-l-4 border-primary-200 pl-4">
                    <h4 className="font-medium mb-2">How do I join existing games?</h4>
                    <p className="text-gray-600">Browse available games in the "Join Games" section and contact the game host to join. Make sure to confirm your spot before heading to the turf.</p>
                  </div>

                  <div className="border-l-4 border-primary-200 pl-4">
                    <h4 className="font-medium mb-2">What if I need to cancel?</h4>
                    <p className="text-gray-600">Contact the turf owner or game host directly via phone or WhatsApp to cancel. Cancellation policies vary by facility.</p>
                  </div>

                  <div className="border-l-4 border-primary-200 pl-4">
                    <h4 className="font-medium mb-2">Location access not working?</h4>
                    <p className="text-gray-600">Make sure location services are enabled for your browser. You can also search manually by entering your area name.</p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Contact Support</h3>
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Email Support</h4>
                    <p className="text-sm text-gray-600 mb-2">For general inquiries and technical issues</p>
                    <a href="mailto:support@tapturf.in" className="text-blue-600 hover:underline">
                      support@tapturf.in
                    </a>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-medium mb-2">WhatsApp Support</h4>
                    <p className="text-sm text-gray-600 mb-2">Quick help and booking assistance</p>
                    <a href="https://wa.me/919999999999" className="text-green-600 hover:underline">
                      +91 99999-99999
                    </a>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Feature Requests</h3>
                <div className="text-gray-600">
                  <p>Have an idea to make TapTurf better? We'd love to hear from you! Send your suggestions to <a href="mailto:feedback@tapturf.in" className="text-primary-600 hover:underline">feedback@tapturf.in</a></p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3">Turf Owner Support</h3>
                <div className="text-gray-600">
                  <p>Are you a turf owner looking to list your facility? Contact us at <a href="mailto:partners@tapturf.in" className="text-primary-600 hover:underline">partners@tapturf.in</a></p>
                </div>
              </section>
            </div>
          )
        };

      default:
        return { title: '', content: null, lastUpdated: null };
    }
  };

  const page = getPageContent();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">{page.title}</h1>
          {page.lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {page.lastUpdated}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6 sm:p-8">
          {page.content}
        </div>
      </div>
    </div>
  );
}