import CoreLocation
import Foundation
import MapKit
import NamazCore

/// Finds the Mac's position through Location Services and names it.
@MainActor
final class LocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    enum State: Equatable {
        case idle
        case locating
        /// The user (or a device policy) has not allowed location access for this app.
        case denied
        case failed(String)
    }

    @Published private(set) var state = State.idle

    /// Called with each successful fix.
    var onPlace: ((Place) -> Void)?

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        // Prayer times move about four seconds per kilometre east or west; city-level is plenty.
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    /// Asks for the current position, prompting for permission the first time.
    func requestPlace() {
        switch manager.authorizationStatus {
        case .notDetermined:
            state = .locating
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            state = .denied
        default:
            state = .locating
            manager.requestLocation()
        }
    }

    private func authorizationChanged(to status: CLAuthorizationStatus) {
        switch status {
        case .notDetermined:
            break
        case .denied, .restricted:
            state = .denied
        default:
            // Permission has just been granted in answer to our prompt; carry on with the fix.
            if state == .locating || state == .denied {
                state = .locating
                manager.requestLocation()
            }
        }
    }

    private func located(at coordinates: Coordinates) async {
        let name = await Self.placeName(for: coordinates) ?? "Current Location"
        state = .idle
        onPlace?(Place(name: name, coordinates: coordinates))
    }

    private static func placeName(for coordinates: Coordinates) async -> String? {
        let location = CLLocation(latitude: coordinates.latitude, longitude: coordinates.longitude)
        if #available(macOS 26, *) {
            guard let request = MKReverseGeocodingRequest(location: location) else { return nil }
            let items = try? await request.mapItems
            return items?.first?.addressRepresentations?.cityName
        } else {
            let placemarks = try? await CLGeocoder().reverseGeocodeLocation(location)
            return placemarks?.first?.locality ?? placemarks?.first?.administrativeArea
        }
    }

    // MARK: - CLLocationManagerDelegate

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in self.authorizationChanged(to: status) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else { return }
        let coordinates = Coordinates(latitude: coordinate.latitude, longitude: coordinate.longitude)
        Task { @MainActor in await self.located(at: coordinates) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let message = error.localizedDescription
        Task { @MainActor in
            // A denial also arrives here as an error; keep the more specific state.
            if self.state != .denied { self.state = .failed(message) }
        }
    }
}
