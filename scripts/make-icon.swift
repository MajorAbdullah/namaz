// Draws the app icon and writes it as an .iconset folder, ready for `iconutil`.
//
//     swift scripts/make-icon.swift build/AppIcon.iconset
//     iconutil -c icns build/AppIcon.iconset -o Resources/AppIcon.icns

import AppKit
import CoreGraphics

/// Draws the icon into a square context `size` pixels on a side.
func drawIcon(in context: CGContext, size: CGFloat) {
    // Work in the 1024-point grid Apple's icon template uses, whatever the output size.
    context.scaleBy(x: size / 1024, y: size / 1024)
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    func color(_ hex: UInt32, alpha: CGFloat = 1) -> CGColor {
        CGColor(
            colorSpace: colorSpace,
            components: [
                CGFloat((hex >> 16) & 0xFF) / 255, CGFloat((hex >> 8) & 0xFF) / 255,
                CGFloat(hex & 0xFF) / 255, alpha,
            ])!
    }

    // The standard macOS icon body: an 824-point rounded square with a soft shadow beneath.
    let body = CGRect(x: 100, y: 100, width: 824, height: 824)
    let bodyPath = CGPath(roundedRect: body, cornerWidth: 186, cornerHeight: 186, transform: nil)

    context.saveGState()
    context.setShadow(offset: CGSize(width: 0, height: -10), blur: 24, color: color(0x000000, alpha: 0.3))
    context.addPath(bodyPath)
    context.setFillColor(color(0x16184A))
    context.fillPath()
    context.restoreGState()

    context.saveGState()
    context.addPath(bodyPath)
    context.clip()

    // Sky before dawn: deep indigo overhead, warming towards the horizon.
    let sky = CGGradient(
        colorsSpace: colorSpace,
        colors: [color(0x12143F), color(0x3B327A), color(0xB0607C), color(0xF2A572)] as CFArray,
        locations: [0, 0.5, 0.86, 1])!
    context.drawLinearGradient(
        sky, start: CGPoint(x: 512, y: body.maxY), end: CGPoint(x: 512, y: body.minY), options: [])

    // A few stars in the upper sky.
    let stars: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
        (236, 786, 7, 0.9), (330, 852, 4, 0.6), (790, 820, 6, 0.8), (846, 690, 4, 0.55),
        (196, 640, 4, 0.5), (742, 596, 3.5, 0.45), (286, 506, 3.5, 0.4), (856, 470, 3, 0.4),
    ]
    for (x, y, radius, alpha) in stars {
        context.setFillColor(color(0xFFFFFF, alpha: alpha))
        context.fillEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
    }

    // The crescent: a disc with a second, offset disc taken out of it.
    let moon = CGPath(ellipseIn: CGRect(x: 262, y: 292, width: 460, height: 460), transform: nil)
    let bite = CGPath(ellipseIn: CGRect(x: 382, y: 352, width: 400, height: 400), transform: nil)
    let crescent = moon.subtracting(bite)

    // A five-pointed star sitting in the crescent's opening.
    let star = CGMutablePath()
    let centre = CGPoint(x: 628, y: 548)
    for index in 0..<10 {
        let radius: CGFloat = index.isMultiple(of: 2) ? 86 : 34
        let angle = CGFloat.pi / 2 + CGFloat(index) * .pi / 5
        let point = CGPoint(x: centre.x + radius * cos(angle), y: centre.y + radius * sin(angle))
        if index == 0 { star.move(to: point) } else { star.addLine(to: point) }
    }
    star.closeSubpath()

    context.setShadow(offset: .zero, blur: 46, color: color(0xFFE9B0, alpha: 0.55))
    context.setFillColor(color(0xFFF6DC))
    context.addPath(crescent)
    context.fillPath()
    context.addPath(star)
    context.fillPath()
    context.restoreGState()
}

func png(size: Int) -> Data {
    let context = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    drawIcon(in: context, size: CGFloat(size))
    let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
    return bitmap.representation(using: .png, properties: [:])!
}

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write(Data("usage: make-icon.swift <output.iconset>\n".utf8))
    exit(1)
}
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

// The sizes an .icns holds, each at 1x and 2x.
for points in [16, 32, 128, 256, 512] {
    try png(size: points).write(to: output.appendingPathComponent("icon_\(points)x\(points).png"))
    try png(size: points * 2).write(to: output.appendingPathComponent("icon_\(points)x\(points)@2x.png"))
}
