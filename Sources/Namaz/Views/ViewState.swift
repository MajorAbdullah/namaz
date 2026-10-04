import SwiftUI

/// `@State`, spelled so that it resolves to the property wrapper rather than the macro.
///
/// From the macOS 27 SDK, `@State` is a macro whose compiler plugin ships with Xcode but not with
/// the Command Line Tools, so it cannot be expanded when building without Xcode. The property
/// wrapper underneath is unchanged, and this alias names it directly.
typealias ViewState<Value> = SwiftUI.State<Value>
