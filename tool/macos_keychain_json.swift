import Foundation
import Security

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(1)
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
  fail("usage: macos_keychain_json.swift <put|get> <service>")
}

let action = arguments[1]
let service = arguments[2]
guard ["put", "get", "delete"].contains(action),
      service.range(of: "^com\\.shareittoo\\.qa\\.staging\\.synthetic-account-vault\\.[a-z0-9-]{8,48}$", options: .regularExpression) != nil else {
  fail("invalid keychain request")
}

var query: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrService as String: service,
  kSecAttrAccount as String: "accounts",
]

if action == "put" {
  let value = FileHandle.standardInput.readDataToEndOfFile()
  guard !value.isEmpty,
        (try? JSONSerialization.jsonObject(with: value)) != nil else {
    fail("invalid keychain value")
  }
  SecItemDelete(query as CFDictionary)
  query[kSecValueData as String] = value
  query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
  guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
    fail("keychain write failed")
  }
  print("{\"stored\":true}")
} else if action == "get" {
  query[kSecReturnData as String] = true
  query[kSecMatchLimit as String] = kSecMatchLimitOne
  var result: CFTypeRef?
  guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
        let value = result as? Data,
        !value.isEmpty else {
    fail("keychain entry unavailable")
  }
  FileHandle.standardOutput.write(value)
} else {
  let status = SecItemDelete(query as CFDictionary)
  guard status == errSecSuccess || status == errSecItemNotFound else {
    fail("keychain deletion failed")
  }
  print("{\"deleted\":true}")
}
