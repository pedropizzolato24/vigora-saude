require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "expo-alarm-countdown"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/vigora-saude/expo-alarm-countdown"
  s.license      = "MIT"
  s.authors      = { "Vigora Saúde" => "dev@vigora.app" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :path => "." }
  s.source_files = "ios/**/*.{h,m,mm,swift}"

  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
end
