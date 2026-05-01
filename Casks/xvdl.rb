cask "xvdl" do
  version "260501.0"
  sha256 "d060ca503d0224824816a16014ca2e8c0d09c44af00efd853a64cb1a9a7237da"

  url "https://github.com/cxa/xvdl/releases/download/v#{version}/XVDL-#{version}-macos.zip"
  name "XVDL"
  desc "Safari Web Extension for downloading videos from X/Twitter posts"
  homepage "https://github.com/cxa/xvdl"

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
