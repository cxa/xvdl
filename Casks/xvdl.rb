cask "xvdl" do
  version "260907.1"
  sha256 :no_check

  url "https://github.com/cxa/xvdl/releases/download/v#{version}/XVDL-#{version}-macos.zip"
  name "XVDL"
  desc "Safari Web Extension for downloading videos from X/Twitter posts"
  homepage "https://github.com/cxa/xvdl"

  auto_updates true
  depends_on macos: ">= :sequoia"

  app "XVDL.app"

  uninstall quit: "com.realazy.xvdl"

  zap trash: [
    "~/Library/Containers/com.realazy.xvdl",
    "~/Library/Containers/com.realazy.xvdl.Extension",
  ]

  caveats do
    <<~EOS
      Open XVDL once after installation, then enable it in Safari > Settings > Extensions.
      Grant website access for x.com and twitter.com.
    EOS
  end
end
