require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-thumbify"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/your-org/react-native-thumbify"
  s.license      = package["license"]
  s.authors      = { "Author" => "author@example.com" }
  s.platforms    = { :ios => "13.0" }

  s.source       = { :git => "https://github.com/your-org/react-native-thumbify.git", :tag => "#{s.version}" }
  s.source_files = "ios/**/*.{h,m,mm,swift}"

  s.dependency "React-Core"
end
